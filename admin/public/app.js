/* ================================================================
   网站管理后台 — app.js
   纯原生 JS，无需构建
================================================================ */
'use strict';

/* ---------------- 全局状态 ---------------- */
var App = {
  token: localStorage.getItem('site_admin_token') || '',
  content: null,
  snapshot: '',
  module: 'dashboard',
  sub: '',
};

/* ================================================================
   通用工具
================================================================ */
function el(tag, attrs, children) {
  var node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function')
        node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined)
        node.setAttribute(k, attrs[k]);
    });
  }
  (children || []).forEach(function (c) {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function clearNode(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(String(r.result).split(',')[1]); };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/* ---------------- API ---------------- */
function api(path, body, method) {
  var opt = { method: method || 'GET', headers: {} };
  if (App.token) opt.headers['Authorization'] = 'Bearer ' + App.token;
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  return fetch('/admin/api' + path, opt).then(function (r) {
    return r.json().then(function (data) {
      if (r.status === 401) { renderLogin(); throw new Error(data.error || '未登录'); }
      if (!r.ok) throw new Error(data.error || '请求失败');
      return data;
    });
  });
}

/* ================================================================
   Toast & Modal
================================================================ */
function toast(msg, type) {
  var root = document.getElementById('toast-root');
  var t = el('div', { class: 'toast ' + (type || '') }, [msg]);
  root.appendChild(t);
  setTimeout(function () {
    t.style.transition = 'opacity .3s'; t.style.opacity = '0';
    setTimeout(function () { t.remove(); }, 300);
  }, 2600);
}

function openModal(title, body, opts) {
  opts = opts || {};
  var root = document.getElementById('modal-root');
  var close;
  var mask = el('div', {
    class: 'modal-mask',
    onclick: function (e) { if (e.target === mask && opts.dismissible !== false) close(); }
  });
  var modal = el('div', { class: 'modal' + (opts.large ? ' lg' : '') });
  var head = el('div', { class: 'modal-head' }, [
    el('h3', null, [title]),
    el('div', { class: 'spacer' })
  ]);
  if (!opts.hideClose)
    head.appendChild(el('button', { class: 'btn icon ghost', onclick: function () { close(); } }, ['✕']));
  var mbody = el('div', { class: 'modal-body' }, [body]);
  modal.appendChild(head); modal.appendChild(mbody);
  if (opts.foot) {
    var foot = el('div', { class: 'modal-foot' }, opts.foot(function () { close(); }));
    modal.appendChild(foot);
  }
  mask.appendChild(modal);
  root.appendChild(mask);
  close = function () { mask.remove(); };
  return close;
}

function confirmModal(title, text, onOk, danger) {
  var close = openModal(title, el('p', { style: 'margin:0;line-height:1.7' }, [text]), {
    foot: function (c) {
      return [
        el('button', { class: 'btn', onclick: c }, ['取消']),
        el('button', {
          class: 'btn ' + (danger ? 'danger' : 'primary'),
          onclick: function () { c(); onOk(); }
        }, ['确定'])
      ];
    }
  });
}

/* ================================================================
   表单控件
================================================================ */
function txt(value, onInput, opts) {
  opts = opts || {};
  var i = el('input', Object.assign({ type: opts.type || 'text', value: value }, opts.attrs || {}));
  i.addEventListener('input', function () { onInput(i.value); });
  return i;
}

function area(value, onInput, rows) {
  var t = el('textarea', { rows: rows || 3 }, [value]);
  t.addEventListener('input', function () { onInput(t.value); });
  return t;
}

function numInput(value, onInput, attr) {
  var i = el('input', Object.assign({ type: 'number', value: value }, attr || {}));
  i.addEventListener('input', function () { onInput(Number(i.value)); });
  return i;
}

function checkbox(value, labelText, onChange) {
  var i = el('input', { type: 'checkbox' });
  i.checked = !!value;
  i.addEventListener('change', function () { onChange(i.checked); });
  return el('label', { class: 'checkbox-field' }, [i, labelText]);
}

function selectBox(value, options, onChange) {
  var s = el('select', null, options.map(function (o) {
    return el('option', { value: o, selected: o === value }, [o]);
  }));
  s.addEventListener('change', function () { onChange(s.value); });
  return s;
}

function field(labelText, control, hint) {
  var kids = [];
  if (labelText) kids.push(el('label', null, [labelText]));
  kids.push(control);
  if (hint) kids.push(el('div', { class: 'field-hint' }, [hint]));
  return el('div', { class: 'field' }, kids);
}

/* ---------------- 图片字段 ---------------- */
function imgField(value, onChange, uploadDir) {
  var wrap = el('div', { class: 'img-field' });
  var preview = el('div', { class: 'img-preview' });
  function setPrev() {
    clearNode(preview);
    if (value) { var im = el('img'); im.src = value; preview.appendChild(im); }
  }
  setPrev();

  var input = txt(value, function (v) { value = v; onChange(v); setPrev(); });
  var fileInp = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  fileInp.addEventListener('change', function () {
    if (!fileInp.files.length) return;
    var f = fileInp.files[0];
    var btn = wrap.querySelector('.upload-btn');
    var old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    fileToBase64(f).then(function (data) {
      return api('/upload', { dir: uploadDir || 'assets', filename: f.name, data: data }, 'POST');
    }).then(function (r) {
      value = r.url; input.value = r.url; onChange(r.url); setPrev();
      assetCache = null;
      toast('已保存到 ' + r.url, 'success');
    }).catch(function (e) { toast(e.message, 'error'); })
      .then(function () { btn.disabled = false; btn.innerHTML = old; });
  });

  var body = el('div', { class: 'body' }, [
    input,
    el('div', { class: 'img-btns' }, [
      el('button', {
        class: 'btn sm', type: 'button',
        onclick: function () { openAssetPicker(function (p) { value = p; input.value = p; onChange(p); setPrev(); }); }
      }, ['素材库']),
      el('button', {
        class: 'btn sm upload-btn', type: 'button',
        onclick: function () { fileInp.click(); }
      }, ['上传图片'])
    ])
  ]);
  body.appendChild(fileInp);
  wrap.appendChild(preview);
  wrap.appendChild(body);
  return wrap;
}

/* ---------------- 素材库弹窗 ---------------- */
var assetCache = null;
function openAssetPicker(onPick) {
  var body = el('div');
  body.appendChild(el('p', { class: 'muted', style: 'margin:0 0 14px' }, ['点击图片即可选中；悬停图片右上角可删除服务器上的文件。']));
  if (!assetCache) body.appendChild(el('div', { class: 'spin dark', style: 'margin:30px auto' }));
  function render(groups) {
    clearNode(body);
    body.appendChild(el('p', { class: 'muted', style: 'margin:0 0 14px' }, ['点击图片即可选中；悬停图片右上角可删除服务器上的文件。']));
    Object.keys(groups).forEach(function (g) {
      if (!groups[g].length) return;
      var grp = el('div', { class: 'asset-group' }, [
        el('div', { class: 'asset-group-title' }, [g + '  (' + groups[g].length + ')'])
      ]);
      var grid = el('div', { class: 'asset-grid' });
      groups[g].forEach(function (p) {
        var im = el('img'); im.src = '/' + p; im.loading = 'lazy';
        var cell = el('div', {
          class: 'asset-cell',
          title: '/' + p,
          onclick: function () { onPick('/' + p); close(); toast('已选择 ' + p, 'success'); }
        }, [
          el('div', { class: 'thumb' }, [im]),
          el('div', { class: 'name' }, [p.split('/').pop()]),
          el('button', {
            class: 'asset-del', title: '从服务器删除此文件', type: 'button',
            onclick: function (e) {
              e.stopPropagation();
              confirmModal('删除图片文件',
                '将立即从服务器删除 /' + p + '，此操作不经过备份、无法撤销。确定删除？',
                function () {
                  api('/assets/delete', { path: p }, 'POST').then(function () {
                    assetCache = null;
                    cell.remove();
                    toast('已删除 ' + p, 'success');
                  }).catch(function (err) { toast(err.message, 'error'); });
                }, true);
            }
          }, ['✕'])
        ]);
        grid.appendChild(cell);
      });
      grp.appendChild(grid);
      body.appendChild(grp);
    });
  }
  var close = openModal('素材库', body, { large: true });
  if (assetCache) render(assetCache);
  else api('/assets').then(function (d) { assetCache = d.groups; render(assetCache); });
}

/* ---------------- 通用列表绑定 ---------------- */
function bindList(container, arr, renderItem, factory, opts) {
  opts = opts || {};
  var nodes = [];
  function makeNode(item, index) {
    var node = el('div', { class: 'list-item' });
    var up = el('button', { class: 'btn icon sm ghost', title: '上移', type: 'button' }, ['↑']);
    var down = el('button', { class: 'btn icon sm ghost', title: '下移', type: 'button' }, ['↓']);
    var del = el('button', { class: 'btn icon sm danger', title: '删除', type: 'button' }, ['✕']);
    up.addEventListener('click', function () { move(index, index - 1); });
    down.addEventListener('click', function () { move(index, index + 1); });
    del.addEventListener('click', function () {
      confirmModal('确认删除', '删除后需点击右上角「保存」才会真正生效。', function () {
        arr.splice(index, 1); node.remove(); refreshIndex(); markDirty();
      }, true);
    });
    var actions = el('div', { class: 'list-item-actions' }, [up, down, del]);
    var inner = el('div', null, [renderItem(item, index)]);
    node.appendChild(actions); node.appendChild(inner);
    return node;
  }
  function refreshIndex() {
    nodes.forEach(function (n, i) {
      n.querySelector('[title=上移]').disabled = i === 0;
      n.querySelector('[title=下移]').disabled = i === nodes.length - 1;
    });
  }
  function move(from, to) {
    if (to < 0 || to >= arr.length) return;
    var item = arr.splice(from, 1)[0];
    arr.splice(to, 0, item);
    var node = nodes.splice(from, 1)[0];
    nodes.splice(to, 0, node);
    if (to === 0) container.insertBefore(node, container.firstChild);
    else container.insertBefore(node, nodes[to - 1].nextSibling);
    refreshIndex(); markDirty();
  }
  arr.forEach(function (item, i) {
    var n = makeNode(item, i); nodes.push(n); container.appendChild(n);
  });
  refreshIndex();
  var addBtn = el('button', {
    class: 'btn sm', type: 'button',
    onclick: function () {
      var item = factory();
      arr.push(item);
      var n = makeNode(item, arr.length - 1);
      nodes.push(n); container.appendChild(n);
      refreshIndex(); markDirty();
      if (opts.onAdd) opts.onAdd(n);
    }
  }, ['＋ ' + (opts.addLabel || '新增一项')]);
  return { node: container, addBtn: addBtn };
}

/* ================================================================
   登录
================================================================ */
function renderLogin() {
  var appRoot = document.getElementById('app');
  clearNode(appRoot);
  var pwInp = el('input', { type: 'password', placeholder: '请输入管理密码', autocomplete: 'current-password' });
  var errBox = el('div', { class: 'login-error', style: 'display:none' });
  function doLogin() {
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 登录中';
    api('/login', { password: pwInp.value }, 'POST').then(function (d) {
      App.token = d.token;
      localStorage.setItem('site_admin_token', d.token);
      boot();
    }).catch(function (e) {
      errBox.style.display = 'block'; errBox.textContent = e.message;
      btn.disabled = false; btn.innerHTML = '登 录';
    });
  }
  var btn = el('button', {
    class: 'btn primary', style: 'width:100%;padding:10px;font-size:14.5px',
    onclick: doLogin
  }, ['登 录']);
  pwInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });

  var card = el('div', { class: 'login-card' }, [
    el('div', { class: 'login-logo' }, ['管']),
    el('h1', null, ['网站管理后台']),
    el('p', { class: 'sub' }, ['个人网站内容管理系统']),
    errBox,
    field('管理密码', pwInp),
    btn
  ]);
  appRoot.appendChild(el('div', { class: 'login-wrap' }, [card]));
  pwInp.focus();
}

/* ================================================================
   模块定义
================================================================ */
var MODULES = [
  { group: '内容管理', items: [
    { id: 'dashboard', label: '概览', icon: '▦' },
    { id: 'hero', label: '首页横幅', icon: '✦' },
    { id: 'bio', label: '个人简介', icon: '❝' },
    { id: 'news', label: '最新动态', icon: '◔' },
  ]},
  { group: '个人经历', items: [
    { id: 'education', label: '教育经历', icon: '❏' },
    { id: 'experience', label: '实习经历', icon: '◧' },
    { id: 'ventures', label: '创业经历', icon: '▲' },
  ]},
  { group: '学术成果', items: [
    { id: 'publications', label: '论文管理', icon: '❖' },
    { id: 'awards', label: '荣誉奖项', icon: '★' },
    { id: 'service', label: '社会服务', icon: '◈' },
    { id: 'playlists', label: '音乐歌单', icon: '♫' },
  ]},
  { group: '站点', items: [
    { id: 'demos', label: 'Demo 管理', icon: '⬡' },
    { id: 'love', label: '爱情相册', icon: '♥' },
    { id: 'settings', label: '站点设置', icon: '✜' },
    { id: 'data', label: '数据与安全', icon: '▣' },
  ]},
];

function moduleMeta(id) {
  for (var i = 0; i < MODULES.length; i++) {
    var f = MODULES[i].items.filter(function (x) { return x.id === id; })[0];
    if (f) return f;
  }
  return { label: id };
}

/* ================================================================
   主框架
================================================================ */
function renderShell() {
  var appRoot = document.getElementById('app');
  clearNode(appRoot);

  var shell = el('div', { class: 'app-shell' });

  /* 侧边栏 */
  var nav = el('div', { class: 'sidebar-nav' });
  MODULES.forEach(function (g) {
    nav.appendChild(el('div', { class: 'nav-group-title' }, [g.group]));
    g.items.forEach(function (m) {
      nav.appendChild(el('button', {
        class: 'nav-item' + (App.module === m.id ? ' active' : ''),
        onclick: function () { switchModule(m.id); }
      }, [
        el('span', { class: 'ico' }, [m.icon]),
        el('span', { class: 'label' }, [m.label])
      ]));
    });
  });
  var sideFoot = el('div', { class: 'sidebar-foot' }, [
    el('span', { class: 'foot-dot' }),
    el('span', { class: 'foot-text' }, ['本地服务 · 127.0.0.1:8787'])
  ]);
  var sidebar = el('div', { class: 'sidebar' }, [
    el('div', { class: 'sidebar-logo' }, [
      el('div', { class: 'mark' }, ['管']),
      el('div', { class: 'txt' }, [
        el('div', { class: 'name' }, ['网站管理后台']),
        el('div', { class: 'desc' }, ['Site Admin'])
      ])
    ]),
    nav,
    sideFoot
  ]);

  /* 主区域 */
  var topTitle = el('h2');
  var crumb = el('span', { class: 'crumb' });
  var dirtyPill = el('span');
  var saveBtn = el('button', { class: 'btn primary', onclick: saveContent }, ['保存修改']);
  var topbar = el('div', { class: 'topbar' }, [
    topTitle, crumb, el('div', { class: 'spacer' }),
    dirtyPill,
    el('a', { class: 'btn', href: '/', target: '_blank' }, ['预览网站 ↗']),
    saveBtn,
    el('button', {
      class: 'btn ghost', title: '退出登录',
      onclick: function () {
        localStorage.removeItem('site_admin_token'); App.token = ''; renderLogin();
      }
    }, ['退出'])
  ]);
  var contentBox = el('div', { class: 'content' });
  var main = el('div', { class: 'main-area' }, [topbar, contentBox]);

  shell.appendChild(sidebar); shell.appendChild(main);
  appRoot.appendChild(shell);

  App.ui = { topTitle: topTitle, crumb: crumb, dirtyPill: dirtyPill, saveBtn: saveBtn, content: contentBox };
  renderModule();
  updateDirty();
}

function switchModule(id) {
  App.module = id; App.sub = '';
  document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
  renderShell();
}

var dirtyScheduled = false;
function markDirty() {
  if (App.previewTick) App.previewTick();
  if (dirtyScheduled) return;
  dirtyScheduled = true;
  requestAnimationFrame(function () { dirtyScheduled = false; updateDirty(); });
}

function updateDirty() {
  if (!App.ui) return;
  var dirty = JSON.stringify(App.content) !== App.snapshot;
  App.isDirty = dirty;
  clearNode(App.ui.dirtyPill);
  if (dirty) App.ui.dirtyPill.appendChild(el('span', { class: 'dirty-pill' }, ['● 有未保存的修改']));
  else App.ui.dirtyPill.appendChild(el('span', { class: 'clean-pill' }, ['✓ 全部已保存']));
  App.ui.saveBtn.disabled = !dirty;
}

function saveContent() {
  var btn = App.ui.saveBtn;
  btn.disabled = true;
  var old = btn.innerHTML;
  btn.innerHTML = '<span class="spin"></span> 保存中';
  api('/content', App.content, 'PUT').then(function (d) {
    App.snapshot = JSON.stringify(App.content);
    toast('保存成功！已重新生成 ' + d.changed.length + ' 个页面，备份：' + d.backup, 'success');
  }).catch(function (e) { toast('保存失败：' + e.message, 'error'); })
    .then(function () { btn.innerHTML = old; updateDirty(); });
}

window.addEventListener('beforeunload', function (e) {
  if (App.isDirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ================================================================
   模块渲染路由
================================================================ */
function renderModule() {
  var meta = moduleMeta(App.module);
  App.ui.topTitle.textContent = meta.label;
  var groupName = '';
  MODULES.forEach(function (g) {
    if (g.items.some(function (x) { return x.id === App.module; })) groupName = g.group;
  });
  App.ui.crumb.textContent = groupName;
  var fn = RENDERERS[App.module];
  clearNode(App.ui.content);
  App.previewTick = null;
  if (fn) fn(App.ui.content);
  appendPreview(App.ui.content);
}

/* ---------------- 实时预览面板 ---------------- */
var PREVIEWABLE = ['hero', 'bio', 'news', 'education', 'experience',
  'ventures', 'publications', 'awards', 'service', 'playlists',
  'demos', 'love', 'settings'];

function appendPreview(box) {
  if (PREVIEWABLE.indexOf(App.module) < 0) return;
  var frame = el('iframe', { class: 'preview-frame', title: '实时预览' });
  var statusEl = el('span', { class: 'preview-status' }, ['渲染中…']);
  var timer = null, lastPayload = '';

  function refresh() {
    var payload;
    try { payload = JSON.stringify({ module: App.module, sub: App.sub, content: App.content }); }
    catch (e) { return; }
    if (payload === lastPayload) return;
    lastPayload = payload;
    statusEl.textContent = '渲染中…';
    api('/preview', { module: previewKey(), content: App.content }, 'POST')
      .then(function (d) {
        frame.srcdoc = d.html;
        statusEl.textContent = '已更新 · 与页面实时一致';
      })
      .catch(function (e) { statusEl.textContent = '预览失败：' + e.message; });
  }
  function previewKey() {
    if (App.module === 'demos' && App.sub === 'gallery') return 'demos:gallery';
    return App.module;
  }
  function pageUrl() {
    switch (App.module) {
      case 'love': return '/love/';
      case 'demos': return App.sub === 'gallery' ? '/demo/' : '/#demos';
      case 'settings': return '/  ·  页头与页脚';
      case 'hero': return '/';
      default: return '/#' + App.module;
    }
  }
  App.previewTick = function () {
    clearTimeout(timer);
    timer = setTimeout(refresh, 700);
  };

  var urlText = el('span', { class: 'preview-url-text' }, [pageUrl()]);
  var lock = el('span', {
    class: 'preview-lock',
    html: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  });
  box.appendChild(el('div', { class: 'preview-panel' }, [
    el('div', { class: 'preview-chrome' }, [
      el('span', { class: 'preview-badge' }, [
        el('span', { class: 'preview-dot' }),
        el('span', { class: 'preview-name' }, ['实时预览'])
      ]),
      el('span', { class: 'preview-lights' }, [
        el('span', { class: 'light l-rust' }),
        el('span', { class: 'light l-gold' }),
        el('span', { class: 'light l-pine' })
      ]),
      el('span', { class: 'preview-url' }, [lock, urlText]),
      statusEl,
      el('button', {
        class: 'btn icon sm ghost preview-refresh', type: 'button',
        title: '刷新预览', onclick: refresh
      }, ['⟳'])
    ]),
    el('div', { class: 'preview-body' }, [frame])
  ]));
  refresh();
}

var RENDERERS = {};
var C = null; // 内容快捷引用

/* ================================================================
   模块：概览
================================================================ */
RENDERERS.dashboard = function (box) {
  var c = App.content;
  function len(a) { return (a || []).length; }
  var pubs = c.publications.categories.reduce(function (s, x) { return s + len(x.items); }, 0);
  var stats = [
    [len(c.news.items), '条动态'], [len(c.education.items), '所学校'],
    [len(c.experience.items), '段实习'], [len(c.ventures.items), '个创业项目'],
    [pubs, '篇论文'], [len(c.awards.items), '条奖项'],
    [len(c.playlists.items), '个歌单'], [len(c.love.items), '张相册照片'],
    [len(c.demo_gallery.items), '个 Demo'],
  ];
  var grid = el('div', { class: 'stat-grid' });
  stats.forEach(function (s) {
    grid.appendChild(el('div', { class: 'stat-card' }, [
      el('div', { class: 'num' }, [String(s[0])]),
      el('div', { class: 'label' }, [s[1]])
    ]));
  });
  box.appendChild(grid);

  var quickCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['快捷操作'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'quick-links' }, [
        quickBtn('✦ 编辑首页横幅', 'hero'),
        quickBtn('◔ 添加最新动态', 'news'),
        quickBtn('❖ 管理论文', 'publications'),
        quickBtn('★ 管理奖项', 'awards'),
        quickBtn('♥ 上传相册照片', 'love'),
        quickBtn('✜ 站点设置', 'settings')
      ])
    ])
  ]);
  box.appendChild(quickCard);

  var flowCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['使用流程'])]),
    el('div', { class: 'card-body' }, [
      el('ol', { style: 'margin:0;padding-left:20px;line-height:2.1' }, [
        el('li', null, ['在左侧选择模块，修改任何内容']),
        el('li', null, ['点击右上角「保存修改」——系统会自动备份并重新生成网站页面']),
        el('li', null, ['点击「预览网站」检查效果']),
        el('li', null, ['确认无误后，将整个网站文件夹部署/推送上线（静态托管即可，无需服务器）'])
      ])
    ])
  ]);
  box.appendChild(flowCard);

  function quickBtn(text, id) {
    return el('button', { class: 'btn', onclick: function () { switchModule(id); } }, [text]);
  }
};

/* ================================================================
   模块：首页横幅
================================================================ */
RENDERERS.hero = function (box) {
  var h = C.hero;
  box.appendChild(el('p', { class: 'section-desc' }, ['编辑网站首屏展示的个人信息、头像、亮点和链接。']));

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['头像照片'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'field' }, [
        el('label', null, ['头像图片']),
        imgField(h.portrait.src, function (v) { h.portrait.src = v; h.portrait.srcset_480 = v; markDirty(); }, 'assets/optimized')
      ]),
      el('div', { class: 'grid-2' }, [
        field('960w 大图路径（可选）', txt(h.portrait.srcset_960, function (v) { h.portrait.srcset_960 = v; markDirty(); })),
        field('sizes 属性', txt(h.portrait.sizes, function (v) { h.portrait.sizes = v; markDirty(); })),
        field('图片宽度', numInput(h.portrait.width, function (v) { h.portrait.width = v; markDirty(); })),
        field('图片高度', numInput(h.portrait.height, function (v) { h.portrait.height = v; markDirty(); })),
        field('alt 替代文本', txt(h.portrait.alt, function (v) { h.portrait.alt = v; markDirty(); }))
      ])
    ])
  ]);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['问候与标题'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'grid-2' }, [
        field('问候语', txt(h.greeting, function (v) { h.greeting = v; markDirty(); })),
        field('中文副标题', txt(h.cn_sub, function (v) { h.cn_sub = v; markDirty(); })),
        field('标题前缀', txt(h.h1_prefix, function (v) { h.h1_prefix = v; markDirty(); }), '如 "Hi, I\'m "'),
        field('强调名字', txt(h.h1_accent, function (v) { h.h1_accent = v; markDirty(); })),
        field('标题后缀', txt(h.h1_suffix, function (v) { h.h1_suffix = v; markDirty(); }))
      ]),
      field('个人简介（短）', area(h.blurb, function (v) { h.blurb = v; markDirty(); }, 3))
    ])
  ]);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', null, ['亮点列表']),
      el('div', { class: 'spacer' })
    ]),
    el('div', { class: 'card-body' })
  ]);
  var hlList = bindList(card.querySelector('.card-body'), h.highlights,
    function (item) {
      return field('', txt(item, function (v) {
        var i = h.highlights.indexOf(item); h.highlights[i] = v; markDirty();
      }));
    },
    function () { return '新的亮点'; }, { addLabel: '添加亮点' });
  card.querySelector('.card-head').appendChild(hlList.addBtn);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['底部链接'])]),
    el('div', { class: 'card-body' })
  ]);
  var lkList = bindList(card.querySelector('.card-body'), h.links,
    function (item) {
      return el('div', null, [
        el('div', { class: 'grid-2' }, [
          field('显示文字', txt(item.label, function (v) { item.label = v; markDirty(); })),
          field('链接地址', txt(item.url, function (v) { item.url = v; markDirty(); }))
        ]),
        checkbox(item.new_tab, '新标签页打开（外链）', function (v) { item.new_tab = v; markDirty(); })
      ]);
    },
    function () { return { label: '新链接', url: 'https://', new_tab: true }; },
    { addLabel: '添加链接' });
  card.querySelector('.card-head').appendChild(lkList.addBtn);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['底部提示文字'])]),
    el('div', { class: 'card-body grid-2' }, [
      field('左侧提示', txt(h.meta_left, function (v) { h.meta_left = v; markDirty(); })),
      field('右侧提示', txt(h.meta_right, function (v) { h.meta_right = v; markDirty(); }))
    ])
  ]);
  box.appendChild(card);
};

/* ================================================================
   模块：个人简介
================================================================ */
RENDERERS.bio = function (box) {
  var b = C.bio;
  box.appendChild(el('p', { class: 'section-desc' }, ['简介第一段默认展示，其余段落会被折叠，访客点击「Show more」后展开。']));

  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(b.no, function (v) { b.no = v; markDirty(); })),
      field('标题', txt(b.title, function (v) { b.title = v; markDirty(); })),
      field('右侧说明', txt(b.count, function (v) { b.count = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['简介段落'])]),
    el('div', { class: 'card-body' })
  ]);
  var list = bindList(card.querySelector('.card-body'), b.paragraphs,
    function (item) {
      return el('div', null, [
        checkbox(item.hidden, '折叠（在「Show more」中）', function (v) { item.hidden = v; markDirty(); }),
        field('段落内容（支持 HTML）', area(item.html, function (v) { item.html = v; markDirty(); }, 5))
      ]);
    },
    function () { return { hidden: true, html: '新的段落…' }; },
    { addLabel: '添加段落' });
  card.querySelector('.card-head').appendChild(list.addBtn);
  box.appendChild(card);
};

/* ================================================================
   模块：最新动态
================================================================ */
RENDERERS.news = function (box) {
  var n = C.news;
  box.appendChild(el('p', { class: 'section-desc' }, ['动态同时用于主页和 News 页面。勾选「News 时间线」的条目才会出现在 /news/ 页面。']));

  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(n.no, function (v) { n.no = v; markDirty(); })),
      field('标题', txt(n.title, function (v) { n.title = v; markDirty(); })),
      field('右侧说明', txt(n.count, function (v) { n.count = v; markDirty(); })),
      field('轮播速度', numInput(n.carousel_speed, function (v) { n.carousel_speed = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  /* 轮播图 */
  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['顶部轮播图片'])]),
    el('div', { class: 'card-body' })
  ]);
  var cList = bindList(card.querySelector('.card-body'), n.carousel,
    function (item) {
      return el('div', null, [
        checkbox(item.gallery, '同步到 News 页面图库', function (v) { item.gallery = v; markDirty(); }),
        field('图片说明 alt', txt(item.alt, function (v) { item.alt = v; markDirty(); })),
        el('div', { class: 'field' }, [el('label', null, ['图片']), imgField(item.src, function (v) { item.src = v; markDirty(); }, 'assets/optimized/news')])
      ]);
    },
    function () { return { src: '', alt: 'New', gallery: false }; },
    { addLabel: '添加图片' });
  card.querySelector('.card-head').appendChild(cList.addBtn);
  box.appendChild(card);

  /* 动态条目 */
  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['动态条目（新的在前）'])]),
    el('div', { class: 'card-body' })
  ]);
  var iList = bindList(card.querySelector('.card-body'), n.items,
    function (item) {
      var tlHtml = el('div', { style: item.timeline ? '' : 'display:none' }, [
        field('News 页面专用内容（留空则与主页相同）',
          area(item.timeline_html || '', function (v) { item.timeline_html = v; markDirty(); }, 3),
          '可填加粗版本，如 One paper is accepted by <b>ICASSP 2026</b>.')
      ]);
      return el('div', null, [
        el('div', { class: 'grid-2' }, [
          field('日期', txt(item.date, function (v) { item.date = v; markDirty(); }), '格式 MM/YYYY，如 09/2026'),
          el('div', { class: 'field' }, [
            el('label', null, ['选项']),
            el('div', { style: 'display:flex;flex-direction:column;gap:6px;padding-top:2px' }, [
              checkbox(item.hidden, '主页折叠（Show more）', function (v) { item.hidden = v; markDirty(); }),
              checkbox(item.timeline, '同步到 News 时间线', function (v) { item.timeline = v; tlHtml.style.display = v ? '' : 'none'; markDirty(); })
            ])
          ])
        ]),
        field('主页内容（支持 HTML）', area(item.html, function (v) { item.html = v; markDirty(); }, 3)),
        tlHtml
      ]);
    },
    function () { return { date: timeNow(), hidden: false, html: '新的动态…', timeline: false }; },
    { addLabel: '添加动态' });
  card.querySelector('.card-head').appendChild(iList.addBtn);
  box.appendChild(card);
};

function timeNow() {
  var d = new Date();
  function p(x) { return (x < 10 ? '0' : '') + x; }
  return p(d.getMonth() + 1) + '/' + d.getFullYear();
}

/* ================================================================
   模块：机构类（教育/实习/创业）
================================================================ */
function orgModule(key, sectionId, uploadDir) {
  return function (box) {
    var sec = C[key];
    var headCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-body grid-3' }, [
        field('编号', txt(sec.no, function (v) { sec.no = v; markDirty(); })),
        field('标题', txt(sec.title, function (v) { sec.title = v; markDirty(); })),
        field('右侧说明', txt(sec.count, function (v) { sec.count = v; markDirty(); }))
      ])
    ]);
    box.appendChild(headCard);

    var card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', null, ['条目列表'])]),
      el('div', { class: 'card-body' })
    ]);
    var list = bindList(card.querySelector('.card-body'), sec.items,
      function (item) {
        var linesWrap = el('div');
        function renderLines() {
          clearNode(linesWrap);
          item.lines.forEach(function (ln) {
            var kindSel = selectBox(ln.kind, ['meta', 'details'], function (v) { ln.kind = v; renderLines(); markDirty(); });
            linesWrap.appendChild(el('div', { class: 'field-row', style: 'align-items:flex-start;margin-bottom:10px' }, [
              el('div', { style: 'width:110px;flex-shrink:0;padding-top:26px' }, [kindSel]),
              el('div', { style: 'flex:1' }, [
                field('', area(ln.html, function (v2) { ln.html = v2; markDirty(); }, 2))
              ]),
              el('div', { style: 'flex-shrink:0;padding-top:24px' }, [
                el('button', {
                  class: 'btn icon sm danger', type: 'button', title: '删除此行',
                  onclick: function () {
                    var i = item.lines.indexOf(ln); item.lines.splice(i, 1); renderLines(); markDirty();
                  }
                }, ['✕'])
              ])
            ]));
          });
          linesWrap.appendChild(el('button', {
            class: 'btn sm', type: 'button',
            onclick: function () { item.lines.push({ kind: 'meta', html: '' }); renderLines(); markDirty(); }
          }, ['＋ 添加一行']));
        }
        renderLines();
        return el('div', null, [
          el('div', { class: 'field' }, [el('label', null, ['机构 Logo']),
            imgField(item.logo, function (v) { item.logo = v; markDirty(); }, uploadDir)]),
          el('div', { class: 'grid-2' }, [
            field('机构名称', txt(item.title, function (v) { item.title = v; markDirty(); })),
            field('Logo alt', txt(item.logo_alt, function (v) { item.logo_alt = v; markDirty(); }))
          ]),
          field('信息行（meta/details）', linesWrap)
        ]);
      },
      function () {
        return { logo: '', logo_alt: 'logo', title: '新机构',
          lines: [{ kind: 'meta', html: '' }] };
      },
      { addLabel: '添加条目' });
    card.querySelector('.card-head').appendChild(list.addBtn);
    box.appendChild(card);
  };
}
RENDERERS.education = orgModule('education', 'education', 'assets/optimized');
RENDERERS.experience = orgModule('experience', 'experience', 'assets');
RENDERERS.ventures = orgModule('ventures', 'ventures', 'assets');

/* ================================================================
   模块：论文管理
================================================================ */
RENDERERS.publications = function (box) {
  var p = C.publications;
  box.appendChild(el('p', { class: 'section-desc' }, ['论文按三个分类管理；每篇论文可设置链接、作者、会议徽章等。']));

  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(p.no, function (v) { p.no = v; markDirty(); })),
      field('标题（支持 <em>）', txt(p.title_html, function (v) { p.title_html = v; markDirty(); })),
      field('右侧说明', txt(p.count, function (v) { p.count = v; markDirty(); })),
      field('Google Scholar 链接', txt(p.scholar_url, function (v) { p.scholar_url = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  var sub = App.sub || p.categories[0].id;
  var subtabs = el('div', { class: 'subtabs' });
  p.categories.forEach(function (cat) {
    subtabs.appendChild(el('button', {
      class: 'subtab' + (sub === cat.id ? ' active' : ''),
      onclick: function () { App.sub = cat.id; renderModule(); }
    }, [cat.label + ' (' + cat.items.length + ')']));
  });
  box.appendChild(subtabs);

  var cat = p.categories.filter(function (x) { return x.id === sub; })[0];

  var catHead = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('分类名称', txt(cat.label, function (v) { cat.label = v; markDirty(); })),
      field('分类颜色 class', selectBox(cat.label_cls, ['pine', 'indigo', 'rust', 'gold'], function (v) { cat.label_cls = v; markDirty(); }),
        'pine/indigo/rust/gold')
    ])
  ]);
  box.appendChild(catHead);

  cat.items.forEach(function (pub) {
    var det = el('details', { class: 'pub-details' });
    var badges = el('div', { class: 'p-badges inline-tags' });
    (pub.venue || []).forEach(function (s) {
      if (s.type === 'badge') {
        badges.appendChild(el('span', { class: 'badge ' + (s.cls === 'gold' ? 'warning' : 'primary') }, [s.text]));
      }
    });
    if (pub.hidden) badges.appendChild(el('span', { class: 'badge danger' }, ['折叠']));
    var sum = el('summary', null, [
      el('span', { class: 'caret' }, ['▶']),
      el('span', { class: 'p-title' }, [pub.no + ' · ' + pub.title]),
      badges
    ]);
    det.appendChild(sum);

    var body = el('div', { class: 'p-body' });
    body.appendChild(el('div', { class: 'grid-3' }, [
      field('编号', txt(pub.no, function (v) { pub.no = v; markDirty(); })),
      field('年份', txt(pub.year, function (v) { pub.year = v; markDirty(); })),
      field('小类文字', txt(pub.cat, function (v) { pub.cat = v; markDirty(); })),
    ]));
    body.appendChild(field('论文标题', txt(pub.title, function (v) { pub.title = v; markDirty(); })));
    body.appendChild(field('论文链接（为空则标题不带链接）', txt(pub.url, function (v) { pub.url = v; markDirty(); })));
    body.appendChild(field('作者（支持 HTML，<b> 可加粗自己）', area(pub.authors, function (v) { pub.authors = v; markDirty(); }, 2)));

    /* 会议/期刊字段段：徽章 与 普通文字 可交错排列 */
    if (!pub.venue) pub.venue = [];
    var segWrap = el('div');
    var segList = bindList(segWrap, pub.venue,
      function (s) {
        var row = el('div', { class: 'grid-3' }, [
          field('类型', selectBox(s.type, ['badge', 'text'], function (v) { s.type = v; markDirty(); renderModule(); }),
            'badge=徽章 / text=普通文字（支持 HTML 实体如 &nbsp;）'),
          field('文字', txt(s.text, function (v) { s.text = v; markDirty(); })),
          field('徽章颜色', selectBox(s.cls || '', ['nlp', 'cv-med', 'cv-ind', 'gold'], function (v) { s.cls = v; markDirty(); }))
        ]);
        return row;
      },
      function () { return { type: 'badge', cls: cat.id === 'nlp' ? 'nlp' : (cat.id === 'med' ? 'cv-med' : 'cv-ind'), text: 'New' }; },
      { addLabel: '添加字段段' });
    body.appendChild(field('会议/期刊字段（从上到下依次显示）', segWrap));
    segWrap.appendChild(segList.addBtn);

    /* 链接 */
    var linkWrap = el('div');
    var lList = bindList(linkWrap, pub.links,
      function (l) {
        return el('div', { class: 'grid-2' }, [
          field('文字', txt(l.label, function (v) { l.label = v; markDirty(); })),
          field('URL', txt(l.url, function (v) { l.url = v; markDirty(); }))
        ]);
      },
      function () { return { label: 'Paper', url: '' }; },
      { addLabel: '添加链接' });
    body.appendChild(field('相关链接', linkWrap));
    linkWrap.appendChild(lList.addBtn);

    body.appendChild(el('div', { class: 'field' }, [
      el('label', null, ['论文配图']),
      imgField(pub.thumb, function (v) { pub.thumb = v; markDirty(); }, 'assets/optimized/papers')
    ]));
    body.appendChild(el('div', { class: 'grid-2' }, [
      field('配图 alt', txt(pub.thumb_alt, function (v) { pub.thumb_alt = v; markDirty(); }))
    ]));
    body.appendChild(checkbox(pub.hidden, '折叠该论文（在「Show more」中）', function (v) { pub.hidden = v; markDirty(); }));

    det.appendChild(body);
    box.appendChild(det);
  });

  box.appendChild(el('button', {
    class: 'btn', style: 'margin-top:4px',
    onclick: function () {
      cat.items.push({
        no: 'No. NEW', year: String(new Date().getFullYear()), cat: 'New',
        title: '新论文', url: '', authors: '', venue: [],
        links: [], thumb: '', thumb_alt: '', hidden: true
      });
      markDirty(); renderModule();
    }
  }, ['＋ 添加论文到「' + cat.label + '」']));
};

/* ================================================================
   模块：奖项
================================================================ */
RENDERERS.awards = function (box) {
  var a = C.awards;
  box.appendChild(el('p', { class: 'section-desc' }, ['管理证书轮播图和奖项列表。']));

  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(a.no, function (v) { a.no = v; markDirty(); })),
      field('标题（支持 <em>）', txt(a.title_html, function (v) { a.title_html = v; markDirty(); })),
      field('右侧说明', txt(a.count, function (v) { a.count = v; markDirty(); })),
      field('轮播速度', numInput(a.carousel_speed, function (v) { a.carousel_speed = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['证书轮播'])]),
    el('div', { class: 'card-body' })
  ]);
  var cList = bindList(card.querySelector('.card-body'), a.carousel,
    function (item) {
      return el('div', null, [
        field('alt 说明', txt(item.alt, function (v) { item.alt = v; markDirty(); })),
        el('div', { class: 'field' }, [el('label', null, ['证书图片']),
          imgField(item.src, function (v) { item.src = v; markDirty(); }, 'assets/optimized/cert')])
      ]);
    },
    function () { return { src: '', alt: 'Certificate' }; },
    { addLabel: '添加证书图' });
  card.querySelector('.card-head').appendChild(cList.addBtn);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['奖项条目'])]),
    el('div', { class: 'card-body' })
  ]);
  var iList = bindList(card.querySelector('.card-body'), a.items,
    function (item) {
      return el('div', null, [
        el('div', { class: 'grid-2' }, [
          field('级别（不含括号）', txt(item.level, function (v) { item.level = v; markDirty(); }), '如 National Gold'),
          el('div', { class: 'field' }, [el('label', null, ['选项']),
            checkbox(item.hidden, '折叠（Show more）', function (v) { item.hidden = v; markDirty(); })])
        ]),
        field('奖项说明（支持 HTML）', area(item.html, function (v) { item.html = v; markDirty(); }, 2))
      ]);
    },
    function () { return { level: 'New Level', hidden: true, html: '' }; },
    { addLabel: '添加奖项' });
  card.querySelector('.card-head').appendChild(iList.addBtn);
  box.appendChild(card);
};

/* ================================================================
   模块：社会服务
================================================================ */
RENDERERS.service = function (box) {
  var s = C.service;
  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(s.no, function (v) { s.no = v; markDirty(); })),
      field('标题（支持 <em>）', txt(s.title_html, function (v) { s.title_html = v; markDirty(); })),
      field('右侧说明', txt(s.count, function (v) { s.count = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['服务条目'])]),
    el('div', { class: 'card-body' })
  ]);
  var list = bindList(card.querySelector('.card-body'), s.items,
    function (item) {
      return el('div', null, [
        field('类别', txt(item.level, function (v) { item.level = v; markDirty(); }), '如 Academic Service'),
        field('内容（支持 HTML）', area(item.html, function (v) { item.html = v; markDirty(); }, 2))
      ]);
    },
    function () { return { level: 'New', html: '' }; },
    { addLabel: '添加条目' });
  card.querySelector('.card-head').appendChild(list.addBtn);
  box.appendChild(card);
};

/* ================================================================
   模块：音乐歌单
================================================================ */
RENDERERS.playlists = function (box) {
  var p = C.playlists;
  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(p.no, function (v) { p.no = v; markDirty(); })),
      field('标题（支持 <em>）', txt(p.title_html, function (v) { p.title_html = v; markDirty(); })),
      field('右侧说明', txt(p.count, function (v) { p.count = v; markDirty(); }))
    ])
  ]);
  box.appendChild(headCard);

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['歌单条目'])]),
    el('div', { class: 'card-body' })
  ]);
  var list = bindList(card.querySelector('.card-body'), p.items,
    function (item) {
      return el('div', null, [
        el('div', { class: 'grid-2' }, [
          field('播放量', txt(item.plays, function (v) { item.plays = v; markDirty(); }), '如 2.1M plays'),
          field('链接', txt(item.url, function (v) { item.url = v; markDirty(); })),
          field('歌单名', txt(item.name, function (v) { item.name = v; markDirty(); })),
          field('备注', txt(item.note, function (v) { item.note = v; markDirty(); })),
          field('创建时间', txt(item.created, function (v) { item.created = v; markDirty(); })),
          field('封面 alt', txt(item.alt, function (v) { item.alt = v; markDirty(); }))
        ]),
        el('div', { class: 'field' }, [el('label', null, ['封面图']),
          imgField(item.cover, function (v) { item.cover = v; markDirty(); }, 'assets/optimized/playlists')])
      ]);
    },
    function () {
      return { plays: '', cover: '', alt: 'cover', url: '', name: '新歌单', note: '', created: '' };
    },
    { addLabel: '添加歌单' });
  card.querySelector('.card-head').appendChild(list.addBtn);
  box.appendChild(card);
};

/* ================================================================
   模块：Demo 管理（首页精选 + 完整画廊）
================================================================ */
RENDERERS.demos = function (box) {
  var sub = App.sub || 'home';
  var subtabs = el('div', { class: 'subtabs' }, [
    el('button', { class: 'subtab' + (sub === 'home' ? ' active' : ''), onclick: function () { App.sub = 'home'; renderModule(); } }, ['首页精选 Demo']),
    el('button', { class: 'subtab' + (sub === 'gallery' ? ' active' : ''), onclick: function () { App.sub = 'gallery'; renderModule(); } }, ['完整 Demo 画廊']),
  ]);
  box.appendChild(subtabs);

  if (sub === 'home') renderHomeDemos(box);
  else renderDemoGallery(box);
};

function renderHomeDemos(box) {
  var d = C.demos;
  var headCard = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('编号', txt(d.no, function (v) { d.no = v; markDirty(); })),
      field('标题（支持 <em>）', txt(d.title_html, function (v) { d.title_html = v; markDirty(); })),
      field('右侧说明', txt(d.count, function (v) { d.count = v; markDirty(); }))
    ]),
    el('div', { class: 'card-body' }, [
      field('开头介绍（支持 HTML）', area(d.intro_html, function (v) { d.intro_html = v; markDirty(); }, 2))
    ])
  ]);
  box.appendChild(headCard);

  d.categories.forEach(function (cat, ci) {
    var card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', null, ['分类：' + cat.label]),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn sm danger', title: '删除整个分类',
          onclick: function () {
            confirmModal('删除分类「' + cat.label + '」', '该分类下的所有 Demo 将一起删除。', function () {
              d.categories.splice(ci, 1); markDirty(); renderModule();
            }, true);
          }
        }, ['删除分类'])
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'grid-2' }, [
          field('分类名称', txt(cat.label, function (v) { cat.label = v; markDirty(); })),
          field('颜色 class', selectBox(cat.label_cls, ['indigo', 'rust', 'pine', 'gold', 'rust-deep'], function (v) { cat.label_cls = v; markDirty(); })),
        ]),
        field('分类引导语', area(cat.lead, function (v) { cat.lead = v; markDirty(); }, 2))
      ])
    ]);

    var itemWrap = el('div', { class: 'card-body' });
    var list = bindList(itemWrap, cat.items,
      function (item) {
        return el('div', null, [
          el('div', { class: 'grid-2' }, [
            field('名称', txt(item.name, function (v) { item.name = v; markDirty(); })),
            field('链接', txt(item.url, function (v) { item.url = v; markDirty(); })),
          ]),
          field('说明', area(item.note, function (v) { item.note = v; markDirty(); }, 2)),
          field('封面类型', selectBox(item.cover_type, ['img', 'iframe'], function (v) { item.cover_type = v; markDirty(); }),
            'img 图片 / iframe 内嵌网页'),
          el('div', { class: 'field' }, [el('label', null, ['封面路径']),
            imgField(item.cover, function (v) { item.cover = v; markDirty(); }, 'assets/demo-thumbs')])
        ]);
      },
      function () { return { name: '新 Demo', url: '', note: '', cover: '', cover_type: 'img' }; },
      { addLabel: '添加 Demo' });
    itemWrap.appendChild(list.addBtn);
    card.appendChild(itemWrap);
    box.appendChild(card);
  });

  box.appendChild(el('button', {
    class: 'btn',
    onclick: function () {
      C.demos.categories.push({ label: '新分类', label_cls: 'indigo', lead: '', items: [] });
      markDirty(); renderModule();
    }
  }, ['＋ 添加分类']));
}

function renderDemoGallery(box) {
  var g = C.demo_gallery;
  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['Demo 画廊条目（/demo/）'])]),
    el('div', { class: 'card-body' })
  ]);
  var list = bindList(card.querySelector('.card-body'), g.items,
    function (item) {
      return el('div', null, [
        el('div', { class: 'grid-3' }, [
          field('标题', txt(item.title, function (v) { item.title = v; markDirty(); })),
          field('标签', selectBox(item.tag, ['研究', '游戏', '治愈', 'RBCC', '雅思'], function (v) { item.tag = v; markDirty(); })),
          field('链接', txt(item.url, function (v) { item.url = v; markDirty(); })),
        ]),
        field('描述', area(item.desc, function (v) { item.desc = v; markDirty(); }, 2))
      ]);
    },
    function () { return { title: '新 Demo', tag: '研究', desc: '', url: '' }; },
    { addLabel: '添加 Demo' });
  card.querySelector('.card-head').appendChild(list.addBtn);
  box.appendChild(card);
}

/* ================================================================
   模块：爱情相册
================================================================ */
RENDERERS.love = function (box) {
  var l = C.love;
  box.appendChild(el('p', { class: 'section-desc' }, ['管理 /love/ 页面的相册。上传的图片会保存到 love/uploads。']));

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-body grid-3' }, [
      field('页面标题', txt(l.page_title, function (v) { l.page_title = v; markDirty(); })),
      field('品牌文字', txt(l.brand, function (v) { l.brand = v; markDirty(); })),
      field('数量模板', txt(l.lead_template, function (v) { l.lead_template = v; markDirty(); }),
        '{n} 会被替换成照片数量')
    ])
  ]);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', null, ['照片（' + l.items.length + '）']),
      el('div', { class: 'spacer' }),
    ]),
    el('div', { class: 'card-body' })
  ]);
  var grid = el('div', { class: 'love-admin-grid' });
  function renderGrid() {
    clearNode(grid);
    l.items.forEach(function (it, i) {
      var im = el('img'); im.src = it.src;
      var cell = el('div', { class: 'love-admin-cell' });
      cell.appendChild(el('div', { class: 'cell-btns' }, [
        el('button', { title: '左移', onclick: function () { swap(i, i - 1); } }, ['←']),
        el('button', { title: '右移', onclick: function () { swap(i, i + 1); } }, ['→']),
        el('button', {
          title: '删除',
          onclick: function () {
            confirmModal('删除照片', '确定删除这张照片吗？', function () { l.items.splice(i, 1); markDirty(); renderGrid(); }, true);
          }
        }, ['✕'])
      ]));
      cell.appendChild(im);
      grid.appendChild(cell);
    });
    var add = el('div', { class: 'love-add-cell' }, ['＋ 上传照片']);
    add.addEventListener('click', function () { fileInp.click(); });
    grid.appendChild(add);
  }
  function swap(a, b) {
    if (b < 0 || b >= l.items.length) return;
    var t = l.items[a]; l.items[a] = l.items[b]; l.items[b] = t;
    markDirty(); renderGrid();
  }
  var fileInp = el('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  fileInp.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInp.files);
    if (!files.length) return;
    add.style.pointerEvents = 'none'; add.textContent = '上传中 0/' + files.length;
    files.reduce(function (p, f, idx) {
      return p.then(function () {
        add.textContent = '上传中 ' + idx + '/' + files.length;
        return fileToBase64(f).then(function (data) {
          return api('/upload', { dir: 'love/uploads', filename: f.name, data: data }, 'POST');
        }).then(function (r) { l.items.push({ src: r.url }); });
      });
    }, Promise.resolve()).then(function () {
      markDirty(); renderGrid();
      toast('全部上传成功', 'success');
    }).catch(function (e) { toast(e.message, 'error'); renderGrid(); });
  });

  renderGrid();
  card.querySelector('.card-body').appendChild(grid);
  card.querySelector('.card-body').appendChild(fileInp);
  box.appendChild(card);
};

/* ================================================================
   模块：站点设置
================================================================ */
RENDERERS.settings = function (box) {
  var s = C.site;
  box.appendChild(el('p', { class: 'section-desc' }, ['管理浏览器标题、描述、顶部导航和页脚。']));

  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['基础信息'])]),
    el('div', { class: 'card-body grid-2' }, [
      field('浏览器标题 <title>', txt(s.title, function (v) { s.title = v; markDirty(); })),
      field('品牌名（导航栏）', txt(s.brand, function (v) { s.brand = v; markDirty(); })),
      field('页面描述（SEO meta description）',
        area(s.description, function (v) { s.description = v; markDirty(); }, 3))
    ])
  ]);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['顶部导航'])]),
    el('div', { class: 'card-body' })
  ]);
  var nList = bindList(card.querySelector('.card-body'), s.masthead_nav,
    function (item) {
      return el('div', null, [
        el('div', { class: 'grid-2' }, [
          field('显示文字', txt(item.label, function (v) { item.label = v; markDirty(); })),
          field('锚点/链接', txt(item.href, function (v) { item.href = v; markDirty(); }))
        ]),
        checkbox(!!item.hidden, '隐藏（以 HTML 注释形式保留，不在页面显示）',
          function (v) { item.hidden = v; markDirty(); })
      ]);
    },
    function () { return { label: '新导航', href: '#' }; },
    { addLabel: '添加导航项' });
  card.querySelector('.card-head').appendChild(nList.addBtn);
  box.appendChild(card);

  var f = s.footer;
  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['页脚'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'grid-2' }, [
        field('文字前段', txt(f.text_before, function (v) { f.text_before = v; markDirty(); })),
        field('更新日期', txt(f.date, function (v) { f.date = v; markDirty(); })),
        field('文字后段', txt(f.text_after, function (v) { f.text_after = v; markDirty(); })),
        field('署名', txt(f.name, function (v) { f.name = v; markDirty(); }))
      ])
    ])
  ]);
  box.appendChild(card);

  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['页脚站点地图'])]),
    el('div', { class: 'card-body' })
  ]);
  var smList = bindList(card.querySelector('.card-body'), f.sitemap,
    function (item) {
      return el('div', { class: 'grid-2' }, [
        field('文字', txt(item.label, function (v) { item.label = v; markDirty(); })),
        field('链接', txt(item.href, function (v) { item.href = v; markDirty(); }))
      ]);
    },
    function () { return { label: 'New', href: '/' }; },
    { addLabel: '添加链接' });
  card.querySelector('.card-head').appendChild(smList.addBtn);
  box.appendChild(card);
};

/* ================================================================
   模块：数据与安全
================================================================ */
RENDERERS.data = function (box) {
  /* 修改密码 */
  var oldPw = el('input', { type: 'password', placeholder: '当前密码' });
  var newPw = el('input', { type: 'password', placeholder: '新密码（至少 4 位）' });
  var card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['修改密码'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'grid-2', style: 'margin-bottom:12px' }, [oldPw, newPw]),
      el('button', {
        class: 'btn primary',
        onclick: function () {
          api('/password', { old_password: oldPw.value, new_password: newPw.value }, 'POST')
            .then(function () { toast('密码已修改', 'success'); oldPw.value = ''; newPw.value = ''; })
            .catch(function (e) { toast(e.message, 'error'); });
        }
      }, ['修改密码'])
    ])
  ]);
  box.appendChild(card);

  /* 备份 */
  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['历史备份'])]),
    el('div', { class: 'card-body' })
  ]);
  var bWrap = el('div');
  card.querySelector('.card-body').appendChild(el('p', { class: 'muted', style: 'margin:0 0 12px' },
    ['每次保存都会自动备份。恢复备份会把内容和页面文件还原到当时的状态。']));
  card.querySelector('.card-body').appendChild(bWrap);
  function loadBackups() {
    api('/backups').then(function (d) {
      clearNode(bWrap);
      if (!d.items.length) bWrap.appendChild(el('p', { class: 'muted' }, ['暂无备份']));
      d.items.forEach(function (b) {
        var row = el('div', { class: 'backup-row' }, [
          el('span', { class: 'id' }, [b.id]),
          el('span', { class: 'badge' }, [b.has_content ? '含内容与页面' : '仅页面']),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn sm danger',
            onclick: function () {
              confirmModal('恢复备份 ' + b.id,
                '将用此备份覆盖当前内容和页面文件（当前状态请先确保已保存）。确定恢复吗？',
                function () {
                  api('/backups/restore', { id: b.id }, 'POST').then(function () {
                    return api('/content');
                  }).then(function (data) {
                    App.content = data; App.snapshot = JSON.stringify(data);
                    C = App.content; updateDirty(); renderModule();
                    toast('已恢复备份 ' + b.id, 'success');
                  }).catch(function (e) { toast(e.message, 'error'); });
                }, true);
            }
          }, ['恢复'])
        ]);
        bWrap.appendChild(row);
      });
    });
  }
  loadBackups();
  box.appendChild(card);

  /* 导入 / 导出 */
  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h3', null, ['导入 / 导出'])]),
    el('div', { class: 'card-body' }, [
      el('div', { class: 'quick-links' }, [
        el('button', {
          class: 'btn primary',
          onclick: function () {
            var blob = new Blob([JSON.stringify(App.content, null, 2)], { type: 'application/json' });
            var a = el('a', { href: URL.createObjectURL(blob), download: 'content.json' });
            a.click(); URL.revokeObjectURL(a.href);
          }
        }, ['⬇ 导出 content.json']),
        el('label', { class: 'btn' }, [
          '⬆ 导入 content.json',
          (function () {
            var inp = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
            inp.addEventListener('change', function () {
              var f = inp.files[0]; if (!f) return;
              var r = new FileReader();
              r.onload = function () {
                try {
                  var data = JSON.parse(r.result);
                  if (typeof data !== 'object') throw new Error('格式错误');
                  confirmModal('确认导入', '导入后内容将替换当前编辑区，请记得点击「保存修改」使其生效。',
                    function () {
                      App.content = data; App.snapshot = JSON.stringify(data);
                      C = App.content; updateDirty(); renderModule();
                      toast('导入成功，请点击保存', 'success');
                    });
                } catch (e) { toast('文件不是合法的内容 JSON', 'error'); }
              };
              r.readAsText(f);
            });
            return inp;
          })()
        ])
      ])
    ])
  ]);
  box.appendChild(card);

  /* 原始 JSON */
  var jsonArea = area(JSON.stringify(App.content, null, 2), function () {}, 20);
  jsonArea.style.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
  jsonArea.style.fontSize = '12.5px';
  card = el('div', { class: 'card' }, [
    el('div', { class: 'card-head' }, [
      el('h3', null, ['原始 JSON（高级）']),
      el('div', { class: 'spacer' }),
      el('button', {
        class: 'btn sm',
        onclick: function () {
          try {
            var data = JSON.parse(jsonArea.value);
            confirmModal('应用 JSON', '将用文本框中的内容替换当前编辑区。', function () {
              App.content = data; C = App.content; updateDirty(); renderModule();
              toast('已应用，请点击保存', 'success');
            });
          } catch (e) { toast('JSON 解析失败：' + e.message, 'error'); }
        }
      }, ['应用到编辑区'])
    ]),
    el('div', { class: 'card-body' }, [jsonArea])
  ]);
  box.appendChild(card);
};

/* ================================================================
   启动
================================================================ */
function boot() {
  api('/content').then(function (data) {
    App.content = data;
    App.snapshot = JSON.stringify(data);
    C = App.content;
    renderShell();
  }).catch(function (e) {
    if (String(e.message).indexOf('未登录') === -1)
      toast('加载内容失败：' + e.message, 'error');
  });
}

if (App.token) boot();
else renderLogin();
