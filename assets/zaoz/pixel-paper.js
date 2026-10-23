/* Sample the supplied logo into grid cells; auto-plays a rotation of subtle motion effects. */
(() => {
  const canvas = document.getElementById('zaozPixelPaper');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const logo = new Image();
  const sample = document.createElement('canvas');
  const sampleContext = sample.getContext('2d', { willReadFrequently: true });

  const CELL = 11;
  const EFFECT_DURATION = 7;   // seconds each effect plays
  const CROSSFADE = 1.2;       // blend window into the next effect

  let cells = [];
  let width = 0, height = 0;
  let paperColor = '#fff';
  let geometry = { cx: 0, cy: 0, maxDist: 1, minDiag: 0, maxDiag: 1 };
  let startTime = 0;

  function resample() {
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const styles = getComputedStyle(document.body);
    paperColor = styles.getPropertyValue('--paper').trim() || '#fff';
    cells = [];

    if (logo.naturalWidth && sampleContext) {
      // Split each former 22px block into 2×2 cells on the 11px paper grid.
      const columns = Math.max(1, Math.floor(Math.min(width - 44, 460) / CELL));
      const rows = Math.max(1, Math.round(columns * logo.naturalHeight / logo.naturalWidth));
      const resolution = 8;
      sample.width = columns * resolution;
      sample.height = rows * resolution;
      sampleContext.drawImage(logo, 0, 0, sample.width, sample.height);
      const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
      const left = Math.round((width - columns * CELL) / (2 * CELL)) * CELL;
      const top = Math.round((height * .62 - rows * CELL / 2) / CELL) * CELL;
      const sunOpacity = Number(styles.getPropertyValue('--pixel-sun-opacity')) || .085;
      const mountainOpacity = Number(styles.getPropertyValue('--pixel-mountain-opacity')) || .045;

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          let alpha = 0, red = 0, green = 0, blue = 0;
          for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
              const offset = ((row * resolution + y) * sample.width + column * resolution + x) * 4;
              const weight = pixels[offset + 3] / 255;
              alpha += weight;
              red += pixels[offset] * weight;
              green += pixels[offset + 1] * weight;
              blue += pixels[offset + 2] * weight;
            }
          }
          if (alpha / (resolution * resolution) < .08) continue;
          const warm = red > blue + 35;
          cells.push({
            x: left + column * CELL + 1,
            y: top + row * CELL + 1,
            col: column,
            row,
            r: Math.round(red / alpha),
            g: Math.round(green / alpha),
            b: Math.round(blue / alpha),
            base: warm ? sunOpacity : mountainOpacity,
            seed: column * 12.9898 + row * 78.233
          });
        }
      }
      canvas.dataset.filledCells = String(cells.length);
      canvas.dataset.cellSize = String(CELL);
      computeGeometry();
    }
  }

  function computeGeometry() {
    if (!cells.length) return;
    let minCol = Infinity, maxCol = -Infinity, minRow = Infinity, maxRow = -Infinity;
    for (const cell of cells) {
      if (cell.col < minCol) minCol = cell.col;
      if (cell.col > maxCol) maxCol = cell.col;
      if (cell.row < minRow) minRow = cell.row;
      if (cell.row > maxRow) maxRow = cell.row;
    }
    geometry.cx = (minCol + maxCol) / 2;
    geometry.cy = (minRow + maxRow) / 2;
    geometry.maxDist = Math.hypot((maxCol - minCol) / 2, (maxRow - minRow) / 2) + 4;
    geometry.minDiag = minCol + minRow * .45 - 4;
    geometry.maxDiag = maxCol + maxRow * .45 + 4;
  }

  // Each effect maps a cell + local time to an opacity multiplier.
  const effects = [
    // 呼吸：整体缓慢起伏
    (cell, t) => .74 + .4 * Math.sin(t * 1.9),
    // 波浪：明暗波从左上向右下流动
    (cell, t) => .8 + .75 * Math.max(0, Math.sin(t * 2.4 - (cell.col + cell.row) * .28)),
    // 闪烁：随机格子星星点点亮起
    (cell, t) => Math.sin(cell.seed + t * 2.6) > .82 ? 2.6 : .78,
    // 涟漪：亮环从中心向外扩散
    (cell, t) => {
      const dist = Math.hypot(cell.col - geometry.cx, cell.row - geometry.cy);
      const radius = (t / EFFECT_DURATION) * geometry.maxDist;
      const delta = dist - radius;
      return .78 + 2.1 * Math.exp(-delta * delta / 14);
    },
    // 扫光：一道亮带斜向掠过
    (cell, t) => {
      const diag = cell.col + cell.row * .45;
      const position = geometry.minDiag + (t / EFFECT_DURATION) * (geometry.maxDiag - geometry.minDiag);
      const delta = diag - position;
      return .78 + 1.9 * Math.exp(-delta * delta / 10);
    }
  ];

  const smooth = x => x * x * (3 - 2 * x);

  function paint(multiplierFor) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = paperColor;
    context.fillRect(0, 0, width, height);

    for (const cell of cells) {
      const multiplier = Math.min(multiplierFor(cell), 2.8);
      const alpha = Math.min(cell.base * multiplier, .55);
      context.fillStyle = `rgba(${cell.r}, ${cell.g}, ${cell.b}, ${alpha.toFixed(3)})`;
      context.fillRect(cell.x, cell.y, CELL - 1, CELL - 1);
    }

    // Grid lines are drawn last so even the filled cells retain their paper edges.
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 11) {
      context.strokeStyle = x % 22 === 0 ? 'rgba(26,22,18,.030)' : 'rgba(26,22,18,.014)';
      context.beginPath();
      context.moveTo(x + .5, 0);
      context.lineTo(x + .5, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 11) {
      context.strokeStyle = y % 22 === 0 ? 'rgba(26,22,18,.030)' : 'rgba(26,22,18,.014)';
      context.beginPath();
      context.moveTo(0, y + .5);
      context.lineTo(width, y + .5);
      context.stroke();
    }
  }

  function frame(now) {
    if (!startTime) startTime = now;
    const time = (now - startTime) / 1000;
    const index = Math.floor(time / EFFECT_DURATION) % effects.length;
    const nextIndex = (index + 1) % effects.length;
    const local = time % EFFECT_DURATION;
    let blend = 0;
    if (local > EFFECT_DURATION - CROSSFADE) {
      blend = smooth((local - (EFFECT_DURATION - CROSSFADE)) / CROSSFADE);
    }
    const current = effects[index];
    const next = effects[nextIndex];
    paint(cell => {
      const a = current(cell, local);
      if (!blend) return a;
      return a + (next(cell, 0) - a) * blend;
    });
    requestAnimationFrame(frame);
  }

  logo.addEventListener('load', () => {
    resample();
    if (reduceMotion) paint(() => 1);
    else requestAnimationFrame(frame);
  }, { once: true });
  logo.src = '/assets/zaoz/mzxlogo.png';

  window.addEventListener('resize', () => {
    resample();
    if (reduceMotion) paint(() => 1);
  }, { passive: true });

  resample();
  paint(() => 1);
})();
