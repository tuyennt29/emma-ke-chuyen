#!/usr/bin/env node
/*
 * Emma kể chuyện – bộ sinh website tĩnh
 * Đọc nội dung trong /content (do trang Admin chỉnh sửa) và xuất ra /dist:
 *   - Mỗi truyện, mỗi chương, mỗi thể loại là một trang HTML riêng (tốt cho SEO)
 *   - sitemap.xml, robots.txt, feed.xml, ads.txt, search-index.json
 * Chạy: npm run build      (bản thật, đưa lên Netlify)
 *       npm run preview    (bản xem thử, link có index.html, xuất ra /preview)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const matter = require("gray-matter");
const { marked } = require("marked");

const PREVIEW = process.argv.includes("--preview");
const ROOT = __dirname;
const OUT = path.join(ROOT, PREVIEW ? "preview" : "dist");
const C = path.join(ROOT, "content");

/* ---------------- đọc dữ liệu ---------------- */
const readJSON = f => JSON.parse(fs.readFileSync(path.join(C, f), "utf8"));
const S = readJSON("settings.json");
S.ads = S.ads || {}; S.gate = S.gate || {}; S.affiliate = S.affiliate || []; S.videoAds = S.videoAds || [];
// Cloudflare Pages: dùng tên miền trong Cài đặt; Netlify: dùng địa chỉ Netlify cấp; có thể ép bằng biến SITE_URL
const ON_CF = !!process.env.CF_PAGES;
const SITE_URL = (process.env.SITE_URL || (ON_CF ? S.siteUrl : (process.env.URL || S.siteUrl)) || "").replace(/\/$/, "");
const GENRES = (readJSON("genres.json").genres || []).map(g => ({ ...g, slug: slugify(g.slug || g.name) }));

function slugify(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
const toDate = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plain = md => String(md || "").replace(/[#*_>`\[\]()!-]/g, " ").replace(/\s+/g, " ").trim();
const words = md => plain(md).split(" ").filter(Boolean).length;
const mins = md => Math.max(1, Math.round(words(md) / 200));
const cut = (s, n = 158) => { s = plain(s); return s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)) + "…"; };
const fmtDate = d => { const [y, m, dd] = toDate(d).split("-"); return `${dd}/${m}/${y}`; };

const STORIES = fs.readdirSync(path.join(C, "stories")).filter(f => f.endsWith(".md")).map(f => {
  const { data } = matter(fs.readFileSync(path.join(C, "stories", f), "utf8"));
  if (data.draft) return null;
  const slug = slugify(path.basename(f, ".md"));
  const chapters = (data.chapters || []).filter(c => c && c.title).map((c, i) => ({
    n: i + 1, title: String(c.title), body: String(c.body || ""), mins: mins(c.body), words: words(c.body)
  })).map(c => {
    // Tên chương chỉ là số ("21", "Chương 21") thì coi như chưa đặt tên, tránh hiện "Chương 21: 21"
    c.name = /^\s*(chương|chuong|chap(ter)?)?\s*\d+\s*[:.\-]?\s*$/i.test(c.title) ? "" : c.title.trim();
    c.label = c.name ? `Chương ${c.n}: ${c.name}` : `Chương ${c.n}`;
    return c;
  });
  if (!chapters.length) return null;
  const genre = GENRES.find(g => g.slug === slugify(data.genre)) || { name: data.genre || "Khác", slug: slugify(data.genre || "khac") };
  return {
    slug, title: String(data.title || slug), genre, author: data.author || S.defaultAuthor || "Emma",
    description: String(data.description || ""), keywords: data.keywords || [], cover: data.cover || "",
    c1: data.color1 || "#1E2A4A", c2: data.color2 || "#4A6FA5", status: data.status || "Đang ra",
    aliases: [].concat(data.aliases || []).map(slugify).filter(a => a && a !== slug),
    featured: !!data.featured, gate: data.gate !== false, date: toDate(data.date), chapters,
    mins: chapters.reduce((a, c) => a + c.mins, 0)
  };
}).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));

const PAGES = fs.readdirSync(path.join(C, "pages")).filter(f => f.endsWith(".md")).map(f => {
  const { data, content } = matter(fs.readFileSync(path.join(C, "pages", f), "utf8"));
  return { slug: slugify(path.basename(f, ".md")), title: data.title || f, description: data.description || cut(content), html: marked.parse(content) };
});

/* Chương có cổng quảng cáo: từ chương startFrom, cứ every chương một lần (mặc định 3, 5, 7…) */
const G = S.gate;
const GATE_OK = S.affiliate.some(a => a && a.url) || S.videoAds.some(v => v && (v.youtubeId || v.videoUrl));
const isGated = (story, n) => !!(GATE_OK && G.enabled && story.gate && n >= (G.startFrom || 3) && (n - (G.startFrom || 3)) % (G.every || 2) === 0);

/* ---------------- tiện ích đường dẫn ---------------- */
// route: đường dẫn thư mục từ gốc, ví dụ "truyen/abc/chuong-2/"
function linker(route, absolute) {
  const depth = route.split("/").filter(Boolean).length;
  return p => {
    if (absolute) return "/" + p;
    let r = "../".repeat(depth) + p;
    if (PREVIEW && p === "") r += "home.html";
    else if (PREVIEW && p.endsWith("/")) r += "index.html";
    return r || "./";
  };
}
const abs = p => SITE_URL + "/" + p;
const R = {
  story: s => `truyen/${s.slug}/`,
  chapter: (s, n) => `truyen/${s.slug}/chuong-${n}/`,
  genre: g => `the-loai/${g.slug}/`,
  page: p => `${p.slug}/`
};

/* ---------------- tài nguyên ---------------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const a = path.join(src, f), b = path.join(dst, f);
    fs.statSync(a).isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
copyDir(path.join(ROOT, "static"), OUT);
copyDir(path.join(ROOT, "assets"), path.join(OUT, "assets"));
if (!PREVIEW) {
  copyDir(path.join(ROOT, "admin"), path.join(OUT, "admin"));
  // Admin dùng đăng nhập của nơi đang chạy web: Netlify (api.netlify.com) hoặc Cloudflare (functions/api/auth)
  const cfgFile = path.join(OUT, "admin", "config.yml");
  let cfg = fs.readFileSync(cfgFile, "utf8")
    .replace(/^site_url:.*$/m, `site_url: ${SITE_URL}`).replace(/^display_url:.*$/m, `display_url: ${SITE_URL}`);
  if (ON_CF) cfg = cfg.replace(/^(\s*)base_url:.*$/m, `$1base_url: ${SITE_URL}`).replace(/^(\s*)auth_endpoint:.*$/m, "$1auth_endpoint: api/auth");
  fs.writeFileSync(cfgFile, cfg);
}
const ver = f => crypto.createHash("md5").update(fs.readFileSync(path.join(ROOT, "assets", f))).digest("hex").slice(0, 8);
const V = { css: ver("style.css"), js: ver("app.js") };

function write(route, html) {
  const file = route.endsWith(".html") || route.endsWith(".xml") || route.endsWith(".txt") || route.endsWith(".json")
    ? path.join(OUT, route) : path.join(OUT, route, "index.html");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

/* ---------------- quảng cáo ---------------- */
const A = S.ads;
// Chuẩn hóa mã AdSense: dán cả thẻ <meta>/<script> hay chỉ dán mã đều lấy đúng phần cần thiết
A.adsenseClient = ((String(A.adsenseClient || "").match(/ca-pub-\d{10,20}/) || [""])[0]);
for (const k of ["slotTop", "slotInChapter", "slotEndChapter", "slotSidebar"]) {
  const v = String(A[k] || "");
  A[k] = ((v.match(/data-ad-slot=["']?(\d{6,})/) || v.match(/^\s*(\d{6,})\s*$/) || [, ""])[1]);
}
function adSlot(key, cls, label) {
  const slot = A[key];
  if (A.adsenseClient && slot) {
    return `<div class="ad-wrap ${cls}"><div class="ad-label">Quảng cáo</div><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(A.adsenseClient)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
  }
  // Trên web thật: chưa có slot thì không hiện khung giữ chỗ (Auto ads của Google tự chèn nếu bật)
  if (!PREVIEW) return "";
  return `<div class="ad ${cls}" aria-hidden="true"><div>Vị trí quảng cáo · ${label}<small>Thêm mã trong Admin → Cài đặt → Quảng cáo</small></div></div>`;
}
function affiliateBox(L) {
  if (!S.affiliate.length) return "";
  return `<div class="box"><h3>Gợi ý cho bạn đọc</h3><div class="aff">${S.affiliate.map(a =>
    `<a href="${esc(a.url)}" target="_blank" rel="sponsored noopener"><b>${esc(a.title)}</b>${a.desc && !/^https?:\/\//i.test(a.desc) ? `<span>${esc(a.desc)}</span>` : ""}<em>${esc(a.cta || "Xem ngay")} →</em></a>`).join("")}</div>
    <p class="disclose">Một số liên kết là tiếp thị liên kết. ${esc(S.siteName)} có thể nhận hoa hồng khi bạn mua hàng, giá không thay đổi.</p></div>`;
}

/* ---------------- thành phần giao diện ---------------- */
const ICON = {
  moon: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 14.5A9 9 0 0 1 9.5 3a.7.7 0 0 0-.9-.8A10 10 0 1 0 21.8 15.4a.7.7 0 0 0-.8-.9Z"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></g></svg>`,
  lock: `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z"/></svg>`
};
function cover(s, L, opts = {}) {
  if (s.cover) return `<div class="cover has-img"><img src="${esc(s.cover.startsWith("http") ? s.cover : L(s.cover.replace(/^\//, "")))}" alt="Bìa truyện ${esc(s.title)}" width="400" height="600" loading="${opts.eager ? "eager" : "lazy"}"></div>`;
  return `<div class="cover" style="--c1:${esc(s.c1)};--c2:${esc(s.c2)}" role="img" aria-label="Bìa truyện ${esc(s.title)}"><div class="glyph">${esc(s.title[0])}</div><div class="cg">${esc(s.genre.name)}</div><div class="ct">${esc(s.title)}</div></div>`;
}
const card = (s, L) => `<a class="card" href="${L(R.story(s))}">${cover(s, L)}<h3>${esc(s.title)}</h3><p>${s.chapters.length} chương · ${s.mins} phút đọc · ${esc(s.status)}</p></a>`;
function sidebar(L) {
  return `<aside class="side">
    ${adSlot("slotSidebar", "ad-rect", "300×250")}
    <div class="box"><h3>Mới cập nhật</h3><ul class="list">${STORIES.slice(0, 8).map(s =>
      `<li><a href="${L(R.story(s))}"><b>${esc(s.title)}</b><span>${fmtDate(s.date)}</span></a></li>`).join("")}</ul></div>
    <div class="box"><h3>Thể loại</h3><div class="chips">${GENRES.map(g => `<a class="chip" href="${L(R.genre(g))}">${esc(g.name)}</a>`).join("")}</div></div>
    ${affiliateBox(L)}
  </aside>`;
}
const crumbs = (L, items) => `<nav class="crumbs" aria-label="Breadcrumb"><a href="${L("")}">Trang chủ</a>${items.map(([t, h]) => ` / ${h ? `<a href="${L(h)}">${esc(t)}</a>` : `<span aria-current="page">${esc(t)}</span>`}`).join("")}</nav>`;
const ldBreadcrumb = items => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: [["Trang chủ", ""], ...items].map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(p) }))
});

/* ---------------- khung trang ---------------- */
function layout({ route, title, description, ogType = "website", image, jsonld = [], body, nav = "", noindex, absolute, prev, next, extraHead = "" }) {
  const L = linker(route, absolute);
  const canonical = abs(route);
  const fullTitle = title ? `${title} | ${S.siteName}` : `${S.siteName} – ${S.tagline}`;
  const img = image || S.ogImage;
  const imgAbs = img ? (img.startsWith("http") ? img : abs(img.replace(/^\//, ""))) : "";
  const desc = cut(description || S.description, 160);
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? `<meta name="robots" content="noindex">` : `<meta name="robots" content="index, follow, max-image-preview:large">`}
<link rel="canonical" href="${esc(canonical)}">
${prev ? `<link rel="prev" href="${esc(abs(prev))}">` : ""}${next ? `<link rel="next" href="${esc(abs(next))}">` : ""}
<meta property="og:site_name" content="${esc(S.siteName)}">
<meta property="og:locale" content="vi_VN">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title || S.siteName)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
${imgAbs ? `<meta property="og:image" content="${esc(imgAbs)}"><meta name="twitter:image" content="${esc(imgAbs)}">` : ""}
<meta name="twitter:card" content="${imgAbs ? "summary_large_image" : "summary"}">
${A.adsenseClient ? `<meta name="google-adsense-account" content="${esc(A.adsenseClient)}">` : ""}
${S.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(S.googleSiteVerification)}">` : ""}
<meta name="theme-color" content="#1F6B5C">
<link rel="icon" href="${L("favicon.svg")}" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(S.siteName)}" href="${L("feed.xml")}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;800&family=Literata:opsz,wght@7..72,400;7..72,600&family=Be+Vietnam+Pro:wght@400;500;600&display=swap">
<link rel="stylesheet" href="${L("assets/style.css")}?v=${V.css}">
<script>try{if(localStorage.getItem("ekc-theme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}</script>
${A.adsenseClient ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(A.adsenseClient)}" crossorigin="anonymous"></script>` : ""}
${S.gaMeasurementId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(S.gaMeasurementId)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${esc(S.gaMeasurementId)}");</script>` : ""}
${jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`).join("\n")}
${extraHead}
</head>
<body>
<a class="skip" href="#main">Bỏ qua đến nội dung</a>
<header class="site-head">
  <div class="wrap head-row">
    <a class="logo" href="${L("")}"><b>Emma</b><span>kể chuyện</span></a>
    <form class="search" action="${L("tim-kiem/")}" method="get" role="search">
      <input name="q" type="search" placeholder="Tìm truyện, thể loại…" aria-label="Tìm truyện">
    </form>
    <nav class="nav" aria-label="Chính">
      <a href="${L("")}"${nav === "home" ? ' class="on"' : ""}>Trang chủ</a>
      <a href="${L("the-loai/")}"${nav === "genres" ? ' class="on"' : ""}>Thể loại</a>
      <a href="${L("gioi-thieu/")}"${nav === "about" ? ' class="on"' : ""}>Giới thiệu</a>
      <button class="theme-btn" id="themeBtn" type="button" aria-label="Đổi giao diện sáng/tối"><span class="i-moon">${ICON.moon}</span><span class="i-sun">${ICON.sun}</span></button>
    </nav>
  </div>
  <div class="progress" id="progress"></div>
</header>
<div class="wrap ad-band">${adSlot("slotTop", "ad-banner", "728×90")}</div>
<main class="wrap" id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap">
    <div><b>${esc(S.siteName)}</b> · ${esc(S.tagline)}<br>© ${new Date().getFullYear()} ${esc(S.siteName)}. Truyện sáng tác, giữ bản quyền tác giả.</div>
    <nav aria-label="Chân trang">
      ${PAGES.map(p => `<a href="${L(R.page(p))}">${esc(p.title)}</a>`).join("")}
      <a href="${L("the-loai/")}">Thể loại</a>
      <a href="${L("feed.xml")}">RSS</a>
    </nav>
  </div>
</footer>
<script src="${L("assets/app.js")}?v=${V.js}" defer></script>
</body>
</html>`;
}

/* ---------------- trang chủ ---------------- */
{
  const route = "";
  const L = linker(route);
  const feat = STORIES.find(s => s.featured) || STORIES[0];
  const done = STORIES.filter(s => s.status === "Hoàn thành");
  const mini = Object.fromEntries(STORIES.map(s => [s.slug, { t: s.title, c: s.chapters.length, c1: s.c1, c2: s.c2 }]));
  const body = `<div class="layout"><div class="col">
    <h1 class="sr">${esc(S.siteName)} – ${esc(S.tagline)}</h1>
    ${feat ? `<section class="hero">
      <a href="${L(R.story(feat))}" tabindex="-1" aria-hidden="true">${cover(feat, L, { eager: true })}</a>
      <div>
        <div class="eyebrow">Truyện nổi bật · ${esc(feat.genre.name)}</div>
        <h2 class="hero-title"><a href="${L(R.story(feat))}">${esc(feat.title)}</a></h2>
        <p>${esc(feat.description)}</p>
        <div class="meta"><span>${feat.chapters.length} chương</span><span>${feat.mins} phút đọc</span><span>Cập nhật ${fmtDate(feat.date)}</span></div>
        <div class="actions"><a class="btn" href="${L(R.chapter(feat, 1))}">Đọc ngay</a><a class="btn ghost" href="${L(R.story(feat))}">Danh sách chương</a></div>
      </div>
    </section>` : ""}
    <section id="continue" hidden data-pattern="${L("truyen/{s}/chuong-{n}/")}">
      <h2 class="section-title">Đang đọc dở</h2><div class="cont"></div>
    </section>
    <script type="application/json" id="ekc-mini">${JSON.stringify(mini).replace(/</g, "\\u003c")}</script>
    <h2 class="section-title">Thể loại</h2>
    <div class="chips">${GENRES.map(g => `<a class="chip" href="${L(R.genre(g))}">${esc(g.name)} <small>${STORIES.filter(s => s.genre.slug === g.slug).length}</small></a>`).join("")}</div>
    <h2 class="section-title">Mới cập nhật <small>${STORIES.length} truyện</small></h2>
    <div class="grid">${STORIES.slice(0, 12).map(s => card(s, L)).join("")}</div>
    ${done.length ? `<h2 class="section-title">Truyện đã hoàn thành <small>${done.length} truyện</small></h2><div class="grid">${done.slice(0, 8).map(s => card(s, L)).join("")}</div>` : ""}
  </div>${sidebar(L)}</div>`;
  write(route, layout({
    route, body, nav: "home",
    jsonld: [{
      "@context": "https://schema.org", "@type": "WebSite", name: S.siteName, url: abs(""), inLanguage: "vi",
      description: S.description,
      potentialAction: { "@type": "SearchAction", target: abs("tim-kiem/") + "?q={search_term_string}", "query-input": "required name=search_term_string" }
    }, {
      "@context": "https://schema.org", "@type": "Organization", name: S.siteName, url: abs(""), logo: abs("favicon.svg")
    }]
  }));
}

/* ---------------- thể loại ---------------- */
{
  const route = "the-loai/";
  const L = linker(route);
  const body = `${crumbs(L, [["Thể loại"]])}<div class="layout"><div class="col">
    <h1 class="page-title">Thể loại truyện</h1>
    <div class="genre-list">${GENRES.map(g => {
      const n = STORIES.filter(s => s.genre.slug === g.slug).length;
      return `<a class="genre-item" href="${L(R.genre(g))}"><b>${esc(g.name)}</b><span>${n} truyện</span><p>${esc(g.description || "")}</p></a>`;
    }).join("")}</div>
  </div>${sidebar(L)}</div>`;
  write(route, layout({ route, title: "Thể loại truyện", description: `Danh sách thể loại truyện ngắn trên ${S.siteName}: ${GENRES.map(g => g.name).join(", ")}.`, body, nav: "genres", jsonld: [ldBreadcrumb([["Thể loại", route]])] }));
}
for (const g of GENRES) {
  const route = R.genre(g);
  const L = linker(route);
  const list = STORIES.filter(s => s.genre.slug === g.slug);
  const body = `${crumbs(L, [["Thể loại", "the-loai/"], [g.name]])}<div class="layout"><div class="col">
    <h1 class="page-title">Truyện ${esc(g.name.toLowerCase())}</h1>
    ${g.description ? `<p class="lead">${esc(g.description)}</p>` : ""}
    ${list.length ? `<div class="grid">${list.map(s => card(s, L)).join("")}</div>` : `<div class="empty">Thể loại này chưa có truyện. Emma đang viết, bạn quay lại sau nhé.</div>`}
  </div>${sidebar(L)}</div>`;
  write(route, layout({
    route, title: `Truyện ${g.name.toLowerCase()} hay`, description: g.description || `Tuyển tập truyện ngắn ${g.name.toLowerCase()} đọc theo chương trên ${S.siteName}.`, body, nav: "genres",
    jsonld: [ldBreadcrumb([["Thể loại", "the-loai/"], [g.name, route]]), {
      "@context": "https://schema.org", "@type": "CollectionPage", name: `Truyện ${g.name}`, url: abs(route),
      hasPart: list.map(s => ({ "@type": "Book", name: s.title, url: abs(R.story(s)) }))
    }]
  }));
}

/* ---------------- trang truyện ---------------- */
for (const s of STORIES) {
  const route = R.story(s);
  const L = linker(route);
  const body = `${crumbs(L, [[s.genre.name, R.genre(s.genre)], [s.title]])}
  <div class="layout"><div class="col">
    <section class="story-head">
      ${cover(s, L, { eager: true })}
      <div class="col">
        <a class="eyebrow" href="${L(R.genre(s.genre))}">${esc(s.genre.name)}</a>
        <h1>${esc(s.title)}</h1>
        <div class="meta"><span>Tác giả: ${esc(s.author)}</span><span>${s.chapters.length} chương</span><span>${s.mins} phút đọc</span><span>${esc(s.status)}</span><span>Cập nhật ${fmtDate(s.date)}</span></div>
        <p class="synopsis">${esc(s.description)}</p>
        <div class="actions">
          <a class="btn" id="readBtn" data-slug="${s.slug}" data-pattern="${L(`truyen/${s.slug}/chuong-{n}/`)}" href="${L(R.chapter(s, 1))}">Đọc từ đầu</a>
          <a class="btn ghost" href="${L(R.chapter(s, s.chapters.length))}">Chương mới nhất</a>
        </div>
      </div>
    </section>
    <h2 class="section-title" id="chuong">Danh sách chương <small>${s.chapters.length} chương</small></h2>
    <ol class="chapters" data-slug="${s.slug}">${s.chapters.map(c =>
      `<li><a href="${L(R.chapter(s, c.n))}" data-n="${c.n}"><span class="n">${String(c.n).padStart(2, "0")}</span><span class="t">${esc(c.name || `Chương ${c.n}`)}</span><span class="r">${isGated(s, c.n) ? `<span class="lock" title="Mở khóa bằng quảng cáo">${ICON.lock}</span>` : ""}${c.mins} phút</span></a></li>`).join("")}</ol>
    ${adSlot("slotEndChapter", "ad-inline", "Responsive")}
  </div>${sidebar(L)}</div>`;
  write(route, layout({
    route, title: `${s.title} – Truyện ${s.genre.name.toLowerCase()}`, description: s.description, ogType: "book", image: s.cover, body,
    jsonld: [ldBreadcrumb([[s.genre.name, R.genre(s.genre)], [s.title, route]]), {
      "@context": "https://schema.org", "@type": "Book", name: s.title, url: abs(route), inLanguage: "vi",
      author: { "@type": "Person", name: s.author }, genre: s.genre.name, description: s.description,
      dateModified: s.date, keywords: s.keywords.join(", ") || undefined, image: s.cover ? abs(s.cover.replace(/^\//, "")) : undefined,
      publisher: { "@type": "Organization", name: S.siteName },
      hasPart: s.chapters.map(c => ({ "@type": "Chapter", position: c.n, name: c.label, url: abs(R.chapter(s, c.n)) }))
    }]
  }));
}

/* ---------------- trang chương ---------------- */
const gateCfg = {
  unlockHours: G.unlockHours || 24, videoSeconds: G.videoSeconds || 15, affiliateSeconds: G.affiliateSeconds || 5,
  videos: S.videoAds.filter(v => v && (v.youtubeId || v.videoUrl)).map(v => ({ title: v.title || "Video nhà tài trợ", yt: v.youtubeId || "", src: v.videoUrl || "", link: v.link || "" }))
};
for (const s of STORIES) {
  for (const c of s.chapters) {
    const route = R.chapter(s, c.n);
    const L = linker(route);
    const gated = isGated(s, c.n);
    // Mỗi dòng là một đoạn văn; dòng thoại bắt đầu bằng "-", "–", "—" hoặc "•" hiển thị bằng gạch ngang kiểu sách in (không thành danh sách chấm tròn)
    const prose = c.body.replace(/\r/g, "").split(/\n+/).map(l => l.trim()).filter(Boolean)
      .map(l => l.replace(/^[-–—•]\s*(?=\S)/, "\u2013 ")).join("\n\n");
    const tokens = marked.lexer(prose);
    const blocks = tokens.filter(t => t.type !== "space").map(t => marked.parser(Object.assign([t], { links: tokens.links })));
    const freeN = gated ? Math.min(2, Math.max(1, Math.floor(blocks.length / 4))) : blocks.length;
    const free = blocks.slice(0, freeN), locked = blocks.slice(freeN);
    const midAd = adSlot("slotInChapter", "ad-inline", "In-article");
    let bodyHtml;
    if (gated) {
      const half = Math.ceil(locked.length / 2);
      bodyHtml = free.join("") + `<div class="locked-part">${locked.slice(0, half).join("")}${midAd}${locked.slice(half).join("")}</div>`;
    } else {
      const half = Math.ceil(blocks.length / 2);
      bodyHtml = blocks.slice(0, half).join("") + midAd + blocks.slice(half).join("");
    }
    const prev = c.n > 1 ? R.chapter(s, c.n - 1) : "";
    const next = c.n < s.chapters.length ? R.chapter(s, c.n + 1) : "";
    const aff = S.affiliate.length ? S.affiliate[c.n % S.affiliate.length] : null;
    const gateHtml = gated ? `
    <div class="gate" id="gate">
      <div class="gate-box">
        <div class="eyebrow">${ICON.lock} Chương ${c.n} có nhà tài trợ</div>
        <h2>${esc(G.title || "Mở khóa để đọc tiếp")}</h2>
        <p>${esc(G.message || "")}</p>
        <div class="gate-opts">
          ${gateCfg.videos.length ? `<button class="gate-opt" type="button" data-act="video"><b>Xem video quảng cáo</b><span>${gateCfg.videoSeconds} giây, rồi đọc tiếp</span></button>` : ""}
          ${aff ? `<a class="gate-opt" data-act="aff" href="${esc(aff.url)}" target="_blank" rel="sponsored noopener"><b>${esc(aff.cta || "Ghé nhà tài trợ")}</b><span>${esc(aff.title)}</span></a>` : ""}
        </div>
        <div class="gate-status" id="gateStatus" aria-live="polite"></div>
        <p class="gate-note">Mở khóa có hiệu lực ${gateCfg.unlockHours} giờ trên thiết bị này.</p>
      </div>
    </div>
    <dialog class="vid-dlg" id="vidDlg" aria-labelledby="vidTitle">
      <div class="vid-head"><b id="vidTitle">Video nhà tài trợ</b><span id="vidCount"></span></div>
      <div class="vid-frame" id="vidFrame"></div>
      <div class="vid-actions"><a class="btn ghost" id="vidLink" href="#" target="_blank" rel="sponsored noopener" hidden>Tìm hiểu thêm</a><button class="btn ghost" type="button" id="vidClose">Đóng</button><button class="btn" type="button" id="vidUnlock" disabled>Mở khóa chương</button></div>
    </dialog>` : "";
    const body = `${crumbs(L, [[s.title, R.story(s)], [`Chương ${c.n}`]])}
  <article class="reader" id="reader" data-slug="${s.slug}" data-n="${c.n}" data-total="${s.chapters.length}">
    <a class="ch-label" href="${L(R.story(s))}">${esc(s.title)}</a>
    <h1>${c.name ? `<span class="ch-num">Chương ${c.n}</span> ${esc(c.name)}` : `Chương ${c.n}`}</h1>
    <div class="sub">${c.words.toLocaleString("vi-VN")} chữ · khoảng ${c.mins} phút đọc · ${esc(s.author)}</div>
    <div class="toolbar">
      <label class="sr" for="chSel">Chọn chương</label>
      <select id="chSel" class="ch-select" data-nav>${s.chapters.map(x => `<option value="${L(R.chapter(s, x.n))}"${x.n === c.n ? " selected" : ""}>${esc(x.label)}</option>`).join("")}</select>
      <span class="sep"></span>
      <button class="tool" type="button" id="fsDown" aria-label="Giảm cỡ chữ">A−</button>
      <button class="tool" type="button" id="fsUp" aria-label="Tăng cỡ chữ">A+</button>
      <button class="tool" type="button" id="toneBtn" aria-pressed="false">Giấy cũ</button>
    </div>
    <div class="text${gated ? " gated" : ""}" id="chapterText">${bodyHtml}</div>
    ${gateHtml}
    <div class="end-mark" aria-hidden="true">· · ·</div>
    ${!next ? `<p class="the-end">Hết truyện. Cảm ơn bạn đã đọc đến cuối.</p>` : ""}
    <nav class="pager" aria-label="Chuyển chương">
      ${prev ? `<a class="btn ghost" href="${L(prev)}" rel="prev">← Chương trước</a>` : `<span class="btn ghost" aria-disabled="true">← Chương trước</span>`}
      <a class="btn ghost mid" href="${L(R.story(s))}#chuong">Danh sách chương</a>
      <a class="btn next" href="${next ? L(next) : L("")}"${next ? ' rel="next"' : ""}>${next ? "Chương sau →" : "Truyện khác →"}</a>
    </nav>
  </article>
  <div class="after-ad">${adSlot("slotEndChapter", "ad-banner", "728×90")}</div>
  <section>
    ${(() => { const rel = STORIES.filter(x => x.slug !== s.slug).sort((a, b) => (b.genre.slug === s.genre.slug) - (a.genre.slug === s.genre.slug)).slice(0, 4);
      return rel.length ? `<h2 class="section-title">Có thể bạn thích</h2><div class="grid">${rel.map(x => card(x, L)).join("")}</div>` : ""; })()}
    <div class="aff-row">${affiliateBox(L)}</div>
  </section>
  ${gated ? `<script type="application/json" id="ekc-gate">${JSON.stringify(gateCfg).replace(/</g, "\\u003c")}</script>` : ""}`;
    const ld = {
      "@context": "https://schema.org", "@type": "Chapter", name: c.label, position: c.n, url: abs(route), inLanguage: "vi",
      author: { "@type": "Person", name: s.author }, dateModified: s.date,
      isPartOf: { "@type": "Book", name: s.title, url: abs(R.story(s)) },
      isAccessibleForFree: !gated
    };
    if (gated) ld.hasPart = { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".locked-part" };
    write(route, layout({
      route, title: `${s.title} – ${c.label}`, description: cut(c.body), ogType: "article", image: s.cover, body, prev, next,
      jsonld: [ldBreadcrumb([[s.title, R.story(s)], [`Chương ${c.n}`, route]]), ld]
    }));
  }
}

/* ---------------- trang tĩnh, tìm kiếm, 404 ---------------- */
for (const p of PAGES) {
  const route = R.page(p);
  const L = linker(route);
  const extra = p.slug === "lien-he" && S.contactEmail ? `<p class="contact"><b>Email:</b> <span class="copy-text" id="mail">${esc(S.contactEmail)}</span> <button class="tool" type="button" data-copy="mail">Sao chép</button></p>` : "";
  write(route, layout({
    route, title: p.title, description: p.description, nav: p.slug === "gioi-thieu" ? "about" : "",
    body: `${crumbs(L, [[p.title]])}<div class="layout"><div class="prose"><h1 class="page-title">${esc(p.title)}</h1>${p.html}${extra}</div>${sidebar(L)}</div>`,
    jsonld: [ldBreadcrumb([[p.title, route]])]
  }));
}
{
  const route = "tim-kiem/";
  const L = linker(route);
  write(route, layout({
    route, title: "Tìm truyện", description: `Tìm truyện ngắn trên ${S.siteName}.`, noindex: true,
    body: `${crumbs(L, [["Tìm kiếm"]])}<div class="layout"><div class="col">
      <h1 class="page-title">Tìm truyện</h1>
      <form class="search big" id="searchPage" role="search"><input id="sq" name="q" type="search" placeholder="Nhập tên truyện, thể loại, nội dung…" aria-label="Từ khóa"><button class="btn" type="submit">Tìm</button></form>
      <p class="lead" id="sCount"></p>
      <div class="grid" id="sResults" data-index="${L("search-index.json")}" data-pattern="${L("truyen/{s}/")}"></div>
    </div>${sidebar(L)}</div>`
  }));
  const index = STORIES.map(s => ({ s: s.slug, t: s.title, g: s.genre.name, d: s.description, n: s.chapters.length, m: s.mins, st: s.status, c1: s.c1, c2: s.c2, k: (s.keywords || []).join(" ") }));
  write("search-index.json", JSON.stringify(index));
}
write("404.html", layout({
  route: "404/", absolute: !PREVIEW, title: "Không tìm thấy trang", noindex: true,
  body: `<div class="empty big"><h1 class="page-title">Trang này không tồn tại</h1><p>Có thể chương đã được đổi tên. Bạn thử quay về trang chủ hoặc tìm truyện nhé.</p><div class="actions" style="justify-content:center"><a class="btn" href="/">Về trang chủ</a><a class="btn ghost" href="/tim-kiem/">Tìm truyện</a></div></div>`
}));

/* ---------------- sitemap, robots, rss, ads.txt ---------------- */
{
  const today = new Date().toISOString().slice(0, 10);
  const urls = [["", today, "1.0"], ["the-loai/", today, "0.6"]]
    .concat(GENRES.map(g => [R.genre(g), today, "0.6"]))
    .concat(STORIES.flatMap(s => [[R.story(s), s.date, "0.9"], ...s.chapters.map(c => [R.chapter(s, c.n), s.date, "0.7"])]))
    .concat(PAGES.map(p => [R.page(p), today, "0.3"]));
  write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d, p]) => `  <url><loc>${esc(abs(u))}</loc><lastmod>${d}</lastmod><priority>${p}</priority></url>`).join("\n")}\n</urlset>\n`);
  write("robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /tim-kiem/\n\nSitemap: ${abs("sitemap.xml")}\n`);
  write("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(S.siteName)}</title><link>${esc(abs(""))}</link><description>${esc(S.description)}</description><language>vi</language>\n${STORIES.slice(0, 30).map(s => `<item><title>${esc(s.title)}</title><link>${esc(abs(R.story(s)))}</link><guid>${esc(abs(R.story(s)))}</guid><pubDate>${new Date(s.date + "T08:00:00+07:00").toUTCString()}</pubDate><description>${esc(s.description)}</description></item>`).join("\n")}\n</channel></rss>\n`);
  // Đường dẫn cũ của truyện (trường "aliases") tự chuyển 301 sang đường dẫn mới
  const redirects = STORIES.flatMap(s => s.aliases.flatMap(a => [
    `/truyen/${a}  /truyen/${s.slug}/  301`,
    `/truyen/${a}/*  /truyen/${s.slug}/:splat  301`
  ]));
  if (redirects.length && !PREVIEW) fs.writeFileSync(path.join(OUT, "_redirects"), redirects.join("\n") + "\n");
  if (A.adsenseClient) write("ads.txt", `google.com, ${A.adsenseClient.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
}

if (PREVIEW) fs.copyFileSync(path.join(OUT, "index.html"), path.join(OUT, "home.html"));
const nCh = STORIES.reduce((a, s) => a + s.chapters.length, 0);
console.log(`✓ ${S.siteName}: ${STORIES.length} truyện, ${nCh} chương, ${GENRES.length} thể loại → ${path.relative(ROOT, OUT)}/ (${SITE_URL})`);
