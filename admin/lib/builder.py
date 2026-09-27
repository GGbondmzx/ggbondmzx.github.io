# -*- coding: utf-8 -*-
"""
builder.py — 静态页面生成器

读取 admin/content.json，把内容渲染成与网站原有结构一致的 HTML 片段，
替换 index.html / news/index.html / love/index.html / demo/index.html 中的
对应区域。页面始终保持纯静态（无运行时 JS 依赖），SEO 与加载速度不受影响。

可单独运行（在网站根目录下）:
    python admin/lib/builder.py
"""
import json
import os
import re
import sys

# ---------------------------------------------------------------- 工具函数

def attr_escape(value):
    """转义 HTML 属性值中的特殊字符（& 保留原样，因为 URL 中常用 &）。"""
    if value is None:
        return ""
    return (str(value)
            .replace("&", "&")
            .replace('"', "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def new_tab_attrs(flag=True):
    return ' target="_blank" rel="noopener noreferrer"' if flag else ""


CAROUSEL_IMG_ONERROR = ("this.style.background='var(--paper-soft)';"
                        "this.style.minWidth='115px';"
                        "this.style.minHeight='65px';")

PUB_IMG_ONERROR = "this.style.display='none';"

# 分类 id 与页面 CSS class 的映射
CAT_CLASS = {"nlp": "nlp", "med": "cv-med", "ind": "cv-ind"}


# ---------------------------------------------------------------- 页头 / 通用

def section_head(no, title_html, count):
    return (
        '        <div class="section-head">\n'
        '          <span class="section-no">{no}</span>\n'
        '          <h2 class="section-title">{title}</h2>\n'
        '          <span class="section-count">{count}</span>\n'
        '        </div>'
    ).format(no=no, title=title_html, count=count)


def toggle_button(btn_id, selector):
    return (
        '        <button class="toggle-btn" id="{bid}" type="button" '
        'aria-expanded="false" onclick="toggleRows(\'{sel}\',\'{bid}\',\'grid\')">\n'
        '          <span id="{bid}Text">Show more</span>\n'
        '          <span class="arrow">↓</span>\n'
        '        </button>'
    ).format(bid=btn_id, sel=selector)


def render_carousel(slides, speed, aria_label, extra_class="", style="",
                    prev_label="Previous", next_label="Next"):
    cls = "carousel"
    if extra_class:
        cls += " " + extra_class
    style_attr = ' style="{}"'.format(style) if style else ""
    slide_html = []
    for s in slides:
        slide_html.append(
            '            <div class="slide"><img alt="{alt}" src="{src}" '
            'loading="lazy" onerror="{oe}" /></div>'
            .format(alt=attr_escape(s.get("alt", "")),
                    src=attr_escape(s.get("src", "")),
                    oe=CAROUSEL_IMG_ONERROR)
        )
    return (
        '        <div class="{cls}" data-speed="{speed}" aria-label="{aria}"{style_attr}>\n'
        '          <button class="car-btn car-prev" type="button" data-dir="-1" '
        'aria-label="{pl}">‹</button>\n'
        '          <button class="car-btn car-next" type="button" data-dir="1" '
        'aria-label="{nl}">›</button>\n'
        '          <div class="carousel-track">\n'
        '{slides}\n'
        '          </div>\n'
        '        </div>'
    ).format(cls=cls, speed=speed, aria=aria_label, style_attr=style_attr,
             pl=prev_label, nl=next_label, slides="\n".join(slide_html))


# ---------------------------------------------------------------- 顶部导航

def render_masthead(site):
    nav_items = []
    for item in site.get("masthead_nav", []):
        line = '      <a href="{href}">{label}</a>'.format(
            href=attr_escape(item.get("href", "")),
            label=item.get("label", ""))
        if item.get("hidden"):
            nav_items.append("      <!-- " + line.strip() + " -->")
        else:
            nav_items.append(line)
    return (
        '  <header class="masthead">\n'
        '    <div class="brand">{brand}</div>\n'
        '    <div class="spacer"></div>\n'
        '    <nav>\n'
        '{nav}\n'
        '    </nav>\n'
        '  </header>'
    ).format(brand=site.get("brand", ""), nav="\n".join(nav_items))


# ---------------------------------------------------------------- Hero

def render_hero(h):
    p = h.get("portrait", {})
    portrait_onerror = ("this.style.display='none'; "
                        "this.parentElement.innerHTML='<div class=fallback>Xu</div>';")
    source = (
        '            <source type="image/webp" '
        'srcset="{s480} 480w, {s960} 960w" sizes="{sizes}" />'
        .format(s480=attr_escape(p.get("srcset_480", p.get("src", ""))),
                s960=attr_escape(p.get("srcset_960", p.get("src", ""))),
                sizes=attr_escape(p.get("sizes", "")))
    )
    img = (
        '            <img src="{src}" alt="{alt}" width="{w}" height="{h}" '
        'loading="eager" fetchpriority="high" decoding="async" onerror="{oe}" />'
        .format(src=attr_escape(p.get("src", "")),
                alt=attr_escape(p.get("alt", "")),
                w=p.get("width", 480), h=p.get("height", 270),
                oe=portrait_onerror)
    )

    highlights = []
    for item in h.get("highlights", []):
        highlights.append("          <li>{}</li>".format(item))

    links = []
    for link in h.get("links", []):
        links.append(
            '      <a href="{url}"{t}>{label}</a>'.format(
                url=attr_escape(link.get("url", "")),
                t=new_tab_attrs(link.get("new_tab", False)),
                label=link.get("label", ""))
        )

    return (
        '  <section class="hero">\n'
        '    <div class="hero-row">\n'
        '      <div class="hero-portrait-wrap">\n'
        '        <div class="hero-portrait">\n'
        '          <picture>\n'
        '{source}\n'
        '{img}\n'
        '          </picture>\n'
        '        </div>\n'
        '      </div>\n'
        '\n'
        '      <div class="hero-main">\n'
        '        <div class="hero-greet">\n'
        '          <span class="dot"></span>\n'
        '          {greet}\n'
        '        </div>\n'
        '        <h1>{prefix}<span class="accent">{accent}</span>{suffix}</h1>\n'
        '        <div class="cn-sub">{cn}</div>\n'
        '        <div class="blurb">\n'
        '          {blurb}\n'
        '        </div>\n'
        '      </div>\n'
        '\n'
        '      <div class="hero-highlights">\n'
        '        <div class="eyebrow">{htitle}</div>\n'
        '        <ul>\n'
        '{highlights}\n'
        '        </ul>\n'
        '      </div>\n'
        '    </div>\n'
        '\n'
        '    <div class="hero-divider"></div>\n'
        '    <div class="hero-meta">\n'
        '      <span>{meta_left}</span>\n'
        '      <span>{meta_right}</span>\n'
        '    </div>\n'
        '\n'
        '    <div class="hero-links">\n'
        '{links}\n'
        '    </div>\n'
        '  </section>'
    ).format(
        source=source, img=img,
        greet=h.get("greeting", ""),
        prefix=h.get("h1_prefix", ""),
        accent=h.get("h1_accent", ""),
        suffix=h.get("h1_suffix", ""),
        cn=h.get("cn_sub", ""),
        blurb=h.get("blurb", ""),
        htitle=h.get("highlights_title", "Highlights"),
        highlights="\n".join(highlights),
        meta_left=h.get("meta_left", ""),
        meta_right=h.get("meta_right", ""),
        links="\n".join(links),
    )


# ---------------------------------------------------------------- Biography

def render_bio(b):
    blocks = []
    for para in b.get("paragraphs", []):
        html = para.get("html", "")
        if para.get("hidden"):
            blocks.append(
                '          <div class="hidden-row" data-bio-hidden style="display:none;">\n'
                '            <p>\n'
                '              {html}\n'
                '            </p>\n'
                '          </div>'.format(html=html)
            )
        else:
            blocks.append(
                '          <p>\n'
                '            {html}\n'
                '          </p>'.format(html=html)
            )
    return (
        '      <section class="section" id="bio">\n'
        '{head}\n'
        '        <div class="prose">\n'
        '{blocks}\n'
        '        </div>\n'
        '{toggle}\n'
        '      </section>'
    ).format(
        head=section_head(b.get("no", ""), b.get("title", ""), b.get("count", "")),
        blocks="\n".join(blocks),
        toggle=toggle_button("bioToggle", "[data-bio-hidden]"),
    )


# ---------------------------------------------------------------- News

def render_news(n):
    carousel = render_carousel(
        n.get("carousel", []),
        n.get("carousel_speed", 85),
        "news carousel", style="margin-bottom:24px")
    items = []
    for item in n.get("items", []):
        li = ('<li><span class="date">[{date}]</span>'
              '<span class="body">{html}</span></li>')
        if item.get("hidden"):
            li = ('<li class="hidden-row" data-news-hidden style="display:none;">'
                  '<span class="date">[{date}]</span>'
                  '<span class="body">{html}</span></li>')
        items.append("          " + li.format(
            date=item.get("date", ""), html=item.get("html", "")))
    return (
        '      <section class="section" id="news">\n'
        '{head}\n'
        '{carousel}\n'
        '        <ul class="ed-list">\n'
        '{items}\n'
        '        </ul>\n'
        '{toggle}\n'
        '      </section>'
    ).format(
        head=section_head(n.get("no", ""), n.get("title", ""), n.get("count", "")),
        carousel=carousel,
        items="\n".join(items),
        toggle=toggle_button("newsToggle", "[data-news-hidden]"),
    )


# ---------------------------------------------------------------- 机构列表

def render_org_section(sec, section_id):
    rows = []
    for it in sec.get("items", []):
        line_html = []
        for ln in it.get("lines", []):
            line_html.append(
                '              <p class="org-{kind}">{html}</p>'.format(
                    kind=ln.get("kind", "meta"), html=ln.get("html", "")))
        rows.append(
            '          <div class="org-row">\n'
            '            <div class="org-logo">\n'
            '              <img src="{logo}" alt="{alt}" loading="lazy" />\n'
            '            </div>\n'
            '            <div>\n'
            '              <p class="org-title">{title}</p>\n'
            '{lines}\n'
            '            </div>\n'
            '          </div>'
            .format(logo=attr_escape(it.get("logo", "")),
                    alt=attr_escape(it.get("logo_alt", "")),
                    title=it.get("title", ""),
                    lines="\n".join(line_html))
        )
    return (
        '      <section class="section" id="{sid}">\n'
        '{head}\n'
        '        <div class="org-list">\n'
        '{rows}\n'
        '        </div>\n'
        '      </section>'
    ).format(
        sid=section_id,
        head=section_head(sec.get("no", ""), sec.get("title", ""), sec.get("count", "")),
        rows="\n".join(rows),
    )


# ---------------------------------------------------------------- Publications

def render_pub(pub, cat_id):
    cls = CAT_CLASS[cat_id]
    article_cls = "pub"
    hidden_attr = ""
    if pub.get("hidden"):
        article_cls = "pub hidden-row"
        hidden_attr = ' data-{cid}-hidden style="display:none;"'.format(cid=cat_id)

    if pub.get("url"):
        title = (
            '<h3 class="pub-title"><a href="{url}"{t}>{title}</a></h3>'
            .format(url=attr_escape(pub.get("url", "")),
                    t=new_tab_attrs(True),
                    title=pub.get("title", "")))
    else:
        title = '<h3 class="pub-title">{}</h3>'.format(pub.get("title", ""))

    venue_parts = []
    for seg in pub.get("venue", []):
        if seg.get("type") == "badge":
            venue_parts.append('<span class="badge {cls}">{text}</span>'.format(
                cls=seg.get("cls", cls), text=seg.get("text", "")))
        else:
            venue_parts.append(seg.get("text", ""))
    venue = '<div class="pub-venue">{}</div>'.format("".join(venue_parts))

    if pub.get("links"):
        las = []
        for l in pub.get("links", []):
            las.append(
                '                <a href="{url}"{t}>{label}</a>'.format(
                    url=attr_escape(l.get("url", "")),
                    t=new_tab_attrs(True),
                    label=l.get("label", "")))
        links = ('<div class="pub-links">\n' + "\n".join(las) +
                 '\n              </div>')
    else:
        links = ""

    thumb = (
        '<div class="pub-thumb-wrap"><img class="pub-thumb" onerror="{oe}" '
        'alt="{alt}" src="{src}" loading="lazy" /></div>'
        .format(oe=PUB_IMG_ONERROR,
                alt=attr_escape(pub.get("thumb_alt", "")),
                src=attr_escape(pub.get("thumb", "")))
    )

    return (
        '          <article class="{acls}"{hidden}>\n'
        '            <div class="pub-no {cls}"><span class="num">{no}</span>'
        '<span class="year">{year}</span></div>\n'
        '            <div class="pub-body">\n'
        '              <div class="pub-cat {cls}">{cat}</div>\n'
        '              {title}\n'
        '              <p class="pub-authors">{authors}</p>\n'
        '              {venue}\n'
        '              {links}\n'
        '            </div>\n'
        '            {thumb}\n'
        '          </article>'
    ).format(
        acls=article_cls, hidden=hidden_attr, cls=cls,
        no=pub.get("no", ""), year=pub.get("year", ""),
        cat=pub.get("cat", ""), title=title,
        authors=pub.get("authors", ""), venue=venue,
        links=links, thumb=thumb,
    )


def render_publications(p):
    blocks = []
    for index, cat in enumerate(p.get("categories", [])):
        margin = "" if index == 0 else ' style="margin-top:32px;"'
        arts = "\n\n".join(
            render_pub(pub, cat["id"]) for pub in cat.get("items", []))
        blocks.append(
            '        <div class="cat-label {lcls}"{margin}>{label}</div>\n'
            '        <div class="pub-list">\n'
            '{arts}\n'
            '        </div>\n'
            '{toggle}'.format(
                lcls=cat.get("label_cls", ""), margin=margin,
                label=cat.get("label", ""), arts=arts,
                toggle=toggle_button(
                    '{}Toggle'.format(cat["id"]),
                    '[data-{}-hidden]'.format(cat["id"])))
        )

    scholar = (
        '        <div style="margin-top:20px; border:1px dashed var(--hairline); '
        'border-radius:14px; padding:16px 24px; text-align:center; '
        'background:var(--paper);">\n'
        '          <a href="{url}"{t} style="font-family:var(--font-sans); '
        'font-size:14px; font-weight:600; color:var(--rust); text-decoration:underline; '
        'text-underline-offset:3px; text-decoration-thickness:1px;">'
        'Google Scholar &#8594;</a>\n'
        '        </div>'
    ).format(url=attr_escape(p.get("scholar_url", "")), t=new_tab_attrs(True))

    return (
        '      <section class="section" id="publications">\n'
        '{head}\n'
        '\n'
        '{blocks}\n'
        '{scholar}\n'
        '      </section>'
    ).format(
        head=section_head(p.get("no", ""), p.get("title_html", ""), p.get("count", "")),
        blocks="\n".join(blocks),
        scholar=scholar,
    )


# ---------------------------------------------------------------- Awards

def render_awards(a):
    carousel = render_carousel(
        a.get("carousel", []),
        a.get("carousel_speed", 60),
        "certificate carousel", extra_class="cert-carousel",
        style="margin-top:24px",
        prev_label="Previous certificate",
        next_label="Next certificate")
    items = []
    for item in a.get("items", []):
        li = ('<li><span class="level">[{level}]</span>'
              '<span class="body">{html}</span></li>')
        if item.get("hidden"):
            li = ('<li class="hidden-row" data-award-hidden style="display:none;">'
                  '<span class="level">[{level}]</span>'
                  '<span class="body">{html}</span></li>')
        items.append("          " + li.format(
            level=item.get("level", ""), html=item.get("html", "")))
    return (
        '      <section class="section" id="awards">\n'
        '{head}\n'
        '        \n'
        '{carousel}\n'
        '\n'
        '        <ul class="ed-list">\n'
        '{items}\n'
        '        </ul>\n'
        '{toggle}\n'
        '      </section>'
    ).format(
        head=section_head(a.get("no", ""), a.get("title_html", ""), a.get("count", "")),
        carousel=carousel,
        items="\n".join(items),
        toggle=toggle_button("awardsToggle", "[data-award-hidden]"),
    )


# ---------------------------------------------------------------- Service

def render_service(s):
    items = []
    for item in s.get("items", []):
        items.append(
            "          <li><span class=\"level\">[{level}]</span>"
            "<span class=\"body\">{html}</span></li>".format(
                level=item.get("level", ""), html=item.get("html", "")))
    return (
        '      <section class="section" id="other">\n'
        '{head}\n'
        '        <ul class="ed-list">\n'
        '{items}\n'
        '        </ul>\n'
        '      </section>'
    ).format(
        head=section_head(s.get("no", ""), s.get("title_html", ""), s.get("count", "")),
        items="\n".join(items),
    )


# ---------------------------------------------------------------- Playlists

def render_playlists(p):
    items = []
    for it in p.get("items", []):
        items.append(
            '          <li><span class="level">[{plays}]</span>'
            '<img class="playlist-cover" src="{cover}" alt="{alt}" loading="lazy" />'
            '<span class="body"><a href="{url}"{t}>{name}</a>'
            '<span class="playlist-note">{note}</span></span>'
            '<span class="playlist-created">{created}</span></li>'
            .format(plays=it.get("plays", ""),
                    cover=attr_escape(it.get("cover", "")),
                    alt=attr_escape(it.get("alt", "")),
                    url=attr_escape(it.get("url", "")),
                    t=new_tab_attrs(True),
                    name=it.get("name", ""),
                    note=it.get("note", ""),
                    created=it.get("created", ""))
        )
    return (
        '      <section class="section" id="playlists">\n'
        '{head}\n'
        '        <ul class="ed-list playlist-list">\n'
        '{items}\n'
        '        </ul>\n'
        '      </section>'
    ).format(
        head=section_head(p.get("no", ""), p.get("title_html", ""), p.get("count", "")),
        items="\n".join(items),
    )


# ---------------------------------------------------------------- Demos

def render_demos(d):
    blocks = []
    for cat in d.get("categories", []):
        item_html = []
        for item in cat.get("items", []):
            if item.get("cover_type") == "iframe":
                cover = (
                    '<iframe src="{src}" loading="lazy" tabindex="-1" '
                    'aria-hidden="true" title="{name} preview"></iframe>'
                    .format(src=attr_escape(item.get("cover", "")),
                            name=attr_escape(item.get("name", "")))
                )
            else:
                cover = (
                    '<img src="{src}" alt="{name} preview" loading="lazy" />'
                    .format(src=attr_escape(item.get("cover", "")),
                            name=attr_escape(item.get("name", "")))
                )
            item_html.append(
                '          <li class="demo-row">\n'
                '            <span class="demo-body"><a href="{url}"{t}>{name}</a>'
                '<span class="demo-note">{note}</span></span>\n'
                '            <span class="demo-cover">{cover}</span>\n'
                '          </li>'
                .format(url=attr_escape(item.get("url", "")),
                        t=new_tab_attrs(True),
                        name=item.get("name", ""),
                        note=item.get("note", ""),
                        cover=cover)
            )
        blocks.append(
            '        <div class="cat-label {lcls}">{label}</div>\n'
            '        <p class="demo-lead">{lead}</p>\n'
            '        <ul class="demo-list">\n'
            '{items}\n'
            '        </ul>'.format(
                lcls=cat.get("label_cls", ""),
                label=cat.get("label", ""),
                lead=cat.get("lead", ""),
                items="\n".join(item_html))
        )
    return (
        '      <section class="section" id="demos">\n'
        '{head}\n'
        '        <p class="demo-intro">{intro}</p>\n'
        '\n'
        '{blocks}\n'
        '      </section>'
    ).format(
        head=section_head(d.get("no", ""), d.get("title_html", ""), d.get("count", "")),
        intro=d.get("intro_html", ""),
        blocks="\n".join(blocks),
    )


# ---------------------------------------------------------------- 页脚

def render_footer(f):
    sitemap = "".join(
        '<a href="{href}" rel="noopener noreferrer">{label}</a>'.format(
            href=attr_escape(s.get("href", "")), label=s.get("label", ""))
        for s in f.get("sitemap", []))
    return (
        '  <footer class="footer">\n'
        '    <span>{before}<time datetime="{date}">{date}</time>{after}</span>\n'
        '    <span>{name}</span>\n'
        '    <span class="foot-sitemap">{sitemap}</span>\n'
        '  </footer>'
    ).format(
        before=f.get("text_before", ""),
        date=f.get("date", ""),
        after=f.get("text_after", ""),
        name=f.get("name", ""),
        sitemap=sitemap,
    )


# ---------------------------------------------------------------- 其他页面

def render_news_page(n):
    gallery_items = []
    for s in n.get("carousel", []):
        if not s.get("gallery", False):
            continue
        gallery_items.append(
            '      <div class="gallery-item"><img alt="{alt}" src="{src}" '
            'loading="lazy" /></div>'
            .format(alt=attr_escape(s.get("alt", "")),
                    src=attr_escape(s.get("src", ""))))
    gallery = (
        '    <div class="gallery">\n'
        '{items}\n'
        '    </div>'
    ).format(items="\n".join(gallery_items))

    timeline_items = []
    for item in n.get("items", []):
        if not item.get("timeline", False):
            continue
        body = item.get("timeline_html") or item.get("html", "")
        timeline_items.append(
            '      <div class="news-item">\n'
            '        <span class="date">[{date}]</span>\n'
            '        <div class="body">{body}</div>\n'
            '      </div>'
            .format(date=item.get("date", ""), body=body))
    timeline = (
        '    <div class="timeline">\n'
        '{items}\n'
        '    </div>'
    ).format(items="\n".join(timeline_items))
    return gallery, timeline


def render_love_page(love):
    brand = love.get("brand", "Love Diary · Xu Wang")
    title = love.get("page_title", "Love Diary")
    n = len(love.get("items", []))
    lead = love.get("lead_template", "我们的相册 · {n}").replace("{n}", str(n))
    figures = []
    for it in love.get("items", []):
        figures.append('<figure><img src="{}" loading="lazy" alt=""></figure>'
                       .format(attr_escape(it.get("src", ""))))
    # 每行放 2 个，保持源文件的紧凑风格
    grid = '<div class="grid">' + "".join(figures) + '</div>'
    return brand, title, lead, grid


def render_demo_page(demo_gallery):
    canonical_cats = ["研究", "游戏", "治愈", "RBCC", "雅思"]
    items = demo_gallery.get("items", [])
    present = []
    for c in canonical_cats:
        if any(it.get("tag") == c for it in items) and c not in present:
            present.append(c)
    for it in items:
        if it.get("tag") not in present:
            present.append(it.get("tag"))
    def js_obj(it):
        parts = []
        for k in ("title", "tag", "desc", "url"):
            parts.append("{}:{}".format(
                k, json.dumps(it.get(k, ""), ensure_ascii=False)))
        return "{" + ", ".join(parts) + "}"

    obj_lines = ["  " + js_obj(it) for it in items]
    demos_js = "[\n" + ",\n".join(obj_lines) + "\n]"
    cats_js = json.dumps(present, ensure_ascii=False, separators=(",", ":"))
    return demos_js, cats_js


# ---------------------------------------------------------------- 区域替换

def replace_region(text, pattern, replacement, label):
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError("区域 [{}] 未找到或不唯一 (匹配 {})".format(label, count))
    return new_text


def render_pages(content, root):
    """渲染全部受管页面（纯内存、不写盘），返回 {相对路径: html}。"""
    pages = {}

    # ============ index.html ============
    with open(os.path.join(root, "index.html"), "r", encoding="utf-8") as f:
        html = f.read()

    site = content.get("site", {})
    html = replace_region(
        html, r"<title>[^<]*</title>",
        "<title>{}</title>".format(site.get("title", "")), "home.title")
    html = replace_region(
        html, r'<meta name="description" content="[^"]*"\s*/?>',
        '<meta name="description" content="{}" />'.format(
            attr_escape(site.get("description", ""))),
        "home.description")
    html = replace_region(
        html, r'<header class="masthead">[\s\S]*?</header>',
        render_masthead(site), "home.masthead")
    html = replace_region(
        html, r'<section class="hero">[\s\S]*?</section>',
        render_hero(content.get("hero", {})), "home.hero")

    section_renderers = [
        ("bio", render_bio(content.get("bio", {}))),
        ("news", render_news(content.get("news", {}))),
        ("education", render_org_section(content.get("education", {}), "education")),
        ("experience", render_org_section(content.get("experience", {}), "experience")),
        ("ventures", render_org_section(content.get("ventures", {}), "ventures")),
        ("publications", render_publications(content.get("publications", {}))),
        ("awards", render_awards(content.get("awards", {}))),
        ("other", render_service(content.get("service", {}))),
        ("playlists", render_playlists(content.get("playlists", {}))),
        ("demos", render_demos(content.get("demos", {}))),
    ]
    for sid, rendered in section_renderers:
        if sid == "demos":
            # 原始 HTML 中 demos section 缺少 </section>，一直延伸到 </main>
            pattern = (r'<section class="section" id="demos">[\s\S]*?'
                       r'(?=\s*</main>)')
        else:
            pattern = r'<section class="section" id="{}">[\s\S]*?</section>'.format(sid)
        html = replace_region(html, pattern, rendered, "home.section." + sid)

    html = replace_region(
        html, r'<footer class="footer">[\s\S]*?</footer>',
        render_footer(site.get("footer", {})), "home.footer")

    pages["index.html"] = html

    # ============ news/index.html ============
    with open(os.path.join(root, "news", "index.html"), "r", encoding="utf-8") as f:
        html = f.read()
    gallery, timeline = render_news_page(content.get("news", {}))
    # 嵌套 div，用后续结构做锚点；模式同时兼容原始页与已生成页（幂等）
    html = replace_region(
        html,
        r'<div class="gallery">[\s\S]*?(?=\s*<div class="timeline">)',
        gallery, "news.gallery")
    html = replace_region(
        html,
        r'<div class="timeline">[\s\S]*?</div>'
        r'(?=\s*</div>\s*<div class="footer">)',
        timeline, "news.timeline")
    pages["news/index.html"] = html

    # ============ love/index.html ============
    with open(os.path.join(root, "love", "index.html"), "r", encoding="utf-8") as f:
        html = f.read()
    brand, title, lead, grid = render_love_page(content.get("love", {}))
    html = replace_region(
        html, r'<div class="brand">[^<]*</div>',
        '<div class="brand">{}</div>'.format(brand), "love.brand")
    html = replace_region(
        html, r"<h1>[^<]*</h1>", "<h1>{}</h1>".format(title), "love.title")
    html = replace_region(
        html, r'<p class="lead">[^<]*</p>',
        '<p class="lead">{}</p>'.format(lead), "love.lead")
    html = replace_region(
        html, r'<div class="grid">[\s\S]*?</div>', grid, "love.grid")
    pages["love/index.html"] = html

    # ============ demo/index.html ============
    with open(os.path.join(root, "demo", "index.html"), "r", encoding="utf-8") as f:
        html = f.read()
    demos_js, cats_js = render_demo_page(content.get("demo_gallery", {}))
    html = replace_region(
        html, r"const DEMOS = \[[\s\S]*?\];",
        "const DEMOS = {};".format(demos_js), "demo.data")
    html = replace_region(
        html, r"const CATEGORIES = \[[\s\S]*?\];",
        "const CATEGORIES = {};".format(cats_js), "demo.categories")
    pages["demo/index.html"] = html

    return pages


def build_site(content, root):
    """根据内容重新生成四个页面并写盘，返回被修改的相对路径列表。"""
    pages = render_pages(content, root)
    changed = []
    for rel, html in pages.items():
        path = os.path.join(root, rel.replace("/", os.sep))
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        changed.append(rel)
    return changed


# ---------------------------------------------------------------- 实时预览

# 模块 -> (页面, 定位锚点)。锚点: top / bottom / 元素 id
PREVIEW_MAP = {
    "hero":         ("index.html", "top"),
    "bio":          ("index.html", "bio"),
    "news":         ("index.html", "news"),
    "education":    ("index.html", "education"),
    "experience":   ("index.html", "experience"),
    "ventures":     ("index.html", "ventures"),
    "publications": ("index.html", "publications"),
    "awards":       ("index.html", "awards"),
    "service":      ("index.html", "other"),
    "playlists":    ("index.html", "playlists"),
    "demos":        ("index.html", "demos"),
    "demos:gallery": ("demo/index.html", "top"),
    "love":         ("love/index.html", "top"),
    "settings":     ("index.html", "bottom"),
}

_PREVIEW_SCROLL_JS = (
    "<script>window.addEventListener('load',function(){"
    "setTimeout(function(){var a=__ANCHOR__;"
    "if(a==='top')window.scrollTo(0,0);"
    "else if(a==='bottom')window.scrollTo(0,document.body.scrollHeight);"
    "else{var n=document.getElementById(a);if(n)n.scrollIntoView();}"
    "},120);});</script>"
)


def render_preview(content, root, module):
    """根据未保存的内容渲染某模块对应页面，注入自动滚动脚本后返回 HTML。"""
    if module not in PREVIEW_MAP:
        raise RuntimeError("该模块不支持预览")
    rel, anchor = PREVIEW_MAP[module]
    html = render_pages(content, root)[rel]
    inject = _PREVIEW_SCROLL_JS.replace("__ANCHOR__", json.dumps(anchor))
    if "</body>" in html:
        html = html.replace("</body>", inject + "</body>", 1)
    else:
        html += inject
    return html


# ---------------------------------------------------------------- CLI

if __name__ == "__main__":
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    content_path = os.path.join(root, "admin", "content.json")
    with open(content_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    result = build_site(data, root)
    print("已重新生成: " + ", ".join(result))
