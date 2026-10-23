/* Emma kể chuyện – tương tác phía trình duyệt */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k, f) { try { var v = localStorage.getItem("ekc:" + k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem("ekc:" + k, JSON.stringify(v)); } catch (e) {} }
  };
  var root = document.documentElement;

  /* ---- Giao diện sáng / tối ---- */
  var themeBtn = $("#themeBtn");
  if (themeBtn) themeBtn.addEventListener("click", function () {
    var dark = root.getAttribute("data-theme") !== "dark";
    root.setAttribute("data-theme", dark ? "dark" : "light");
    try { localStorage.setItem("ekc-theme", dark ? "dark" : "light"); } catch (e) {}
  });

  /* ---- Đang đọc dở (trang chủ) ---- */
  var cont = $("#continue"), mini = $("#ekc-mini");
  if (cont && mini) {
    var data = JSON.parse(mini.textContent), progress = store.get("progress", {}), html = "";
    Object.keys(progress).sort(function (a, b) { return (progress[b].at || 0) - (progress[a].at || 0); }).forEach(function (slug) {
      var s = data[slug], p = progress[slug]; if (!s) return;
      var n = Math.min(p.n || p, s.c);
      var url = cont.dataset.pattern.replace("{s}", slug).replace("{n}", n);
      html += '<a href="' + url + '"><div class="mini" style="--c1:' + s.c1 + ';--c2:' + s.c2 + '"></div><div><b></b><span>Đọc tiếp chương ' + n + "/" + s.c + "</span></div></a>";
    });
    if (html) {
      $(".cont", cont).innerHTML = html;
      var titles = $$(".cont b", cont), i = 0;
      Object.keys(progress).sort(function (a, b) { return (progress[b].at || 0) - (progress[a].at || 0); }).forEach(function (slug) { if (data[slug]) titles[i++].textContent = data[slug].t; });
      cont.hidden = false;
    }
  }

  /* ---- Trang truyện: đánh dấu chương đã đọc, nút đọc tiếp ---- */
  var chList = $(".chapters");
  if (chList) {
    var read = store.get("read", {})[chList.dataset.slug] || [];
    $$("a[data-n]", chList).forEach(function (a) { if (read.indexOf(+a.dataset.n) > -1) a.classList.add("read"); });
  }
  var readBtn = $("#readBtn");
  if (readBtn) {
    var pr = store.get("progress", {})[readBtn.dataset.slug];
    if (pr) { var pn = pr.n || pr; readBtn.href = readBtn.dataset.pattern.replace("{n}", pn); readBtn.textContent = "Đọc tiếp chương " + pn; }
  }

  /* ---- Trình đọc ---- */
  var reader = $("#reader");
  if (reader) {
    var slug = reader.dataset.slug, n = +reader.dataset.n;
    var p = store.get("progress", {}); p[slug] = { n: n, at: Date.now() }; store.set("progress", p);
    var r = store.get("read", {}); r[slug] = (r[slug] || []).filter(function (x) { return x !== n; }).concat(n); store.set("read", r);

    // Chọn chương
    $$("select[data-nav]").forEach(function (sel) { sel.addEventListener("change", function () { location.href = sel.value; }); });

    // Cỡ chữ
    var fs = store.get("fs", 19);
    var applyFs = function () { root.style.setProperty("--read-size", fs + "px"); };
    applyFs();
    $("#fsUp").addEventListener("click", function () { fs = Math.min(26, fs + 1); store.set("fs", fs); applyFs(); });
    $("#fsDown").addEventListener("click", function () { fs = Math.max(15, fs - 1); store.set("fs", fs); applyFs(); });

    // Nền giấy cũ
    var toneBtn = $("#toneBtn");
    var applyTone = function (on) { reader.classList.toggle("sepia", on); toneBtn.setAttribute("aria-pressed", on ? "true" : "false"); };
    applyTone(store.get("sepia", false));
    toneBtn.addEventListener("click", function () { var on = !reader.classList.contains("sepia"); store.set("sepia", on); applyTone(on); });

    // Phím tắt ← →
    document.addEventListener("keydown", function (e) {
      if (e.target.matches("input,select,textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      var a = e.key === "ArrowLeft" ? $('.pager a[rel="prev"]') : e.key === "ArrowRight" ? $('.pager a[rel="next"]') : null;
      if (a) location.href = a.href;
    });

    // Thanh tiến độ
    var bar = $("#progress");
    var onScroll = function () {
      var rect = reader.getBoundingClientRect(), total = rect.height - innerHeight;
      bar.style.width = (total > 0 ? Math.min(100, Math.max(0, -rect.top / total * 100)) : 100) + "%";
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    initGate(slug, n);
  }

  /* ---- Cổng mở khóa bằng quảng cáo ---- */
  function initGate(slug, n) {
    var text = $("#chapterText"), cfgEl = $("#ekc-gate");
    if (!text || !text.classList.contains("gated") || !cfgEl) return;
    var cfg = JSON.parse(cfgEl.textContent);
    var key = "unlock:" + slug + ":" + n;
    var until = store.get(key, 0);
    if (until > Date.now()) { text.classList.remove("gated"); return; }

    var status = $("#gateStatus");
    var unlock = function (how) {
      store.set(key, Date.now() + cfg.unlockHours * 3600 * 1000);
      text.classList.remove("gated");
      if (window.gtag) window.gtag("event", "unlock_chapter", { method: how, story: slug, chapter: n });
      var first = $(".locked-part", text);
      if (first) first.setAttribute("tabindex", "-1"), first.focus({ preventScroll: true });
    };

    // Link affiliate: mở trang đối tác ở tab mới, đếm ngược rồi mở khóa
    var aff = $('[data-act="aff"]');
    if (aff) aff.addEventListener("click", function () {
      var left = cfg.affiliateSeconds;
      status.textContent = "Cảm ơn bạn! Chương sẽ mở sau " + left + " giây…";
      var t = setInterval(function () {
        left--;
        if (left <= 0) { clearInterval(t); status.textContent = ""; unlock("affiliate"); }
        else status.textContent = "Cảm ơn bạn! Chương sẽ mở sau " + left + " giây…";
      }, 1000);
    });

    // Video quảng cáo
    var dlg = $("#vidDlg"), frame = $("#vidFrame"), count = $("#vidCount"), btn = $("#vidUnlock"), link = $("#vidLink"), timer;
    var vbtn = $('[data-act="video"]');
    if (!vbtn || !dlg) return;
    var close = function () { clearInterval(timer); frame.innerHTML = ""; if (dlg.open) dlg.close(); };
    vbtn.addEventListener("click", function () {
      var v = cfg.videos.length ? cfg.videos[Math.floor(Math.random() * cfg.videos.length)] : null;
      $("#vidTitle").textContent = v ? v.title : "Video nhà tài trợ";
      if (v && v.yt) frame.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.yt) + '?autoplay=1&mute=1&playsinline=1&rel=0" title="Video quảng cáo" allow="autoplay; encrypted-media" allowfullscreen></iframe>';
      else if (v && v.src) { frame.innerHTML = '<video autoplay muted playsinline controls></video>'; $("video", frame).src = v.src; }
      else frame.innerHTML = '<div class="vid-demo"><div><b>Không gian dành cho nhà tài trợ</b><small>Video mẫu · thêm video quảng cáo trong Admin → Cài đặt</small></div></div>';
      frame.insertAdjacentHTML("beforeend", '<div class="vid-bar" id="vidBar"></div>');
      if (v && v.link) { link.href = v.link; link.hidden = false; } else link.hidden = true;
      btn.disabled = true;
      var left = cfg.videoSeconds, total = left, vbar = $("#vidBar");
      count.textContent = "Còn " + left + " giây";
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      requestAnimationFrame(function () { vbar.style.width = (1 / total * 100) + "%"; });
      timer = setInterval(function () {
        left--;
        vbar.style.width = ((total - left + 1) / total * 100) + "%";
        if (left <= 0) { clearInterval(timer); count.textContent = "Đã xem xong"; btn.disabled = false; btn.focus(); }
        else count.textContent = "Còn " + left + " giây";
      }, 1000);
    });
    btn.addEventListener("click", function () { close(); unlock("video"); });
    $("#vidClose").addEventListener("click", close);
    dlg.addEventListener("cancel", function () { clearInterval(timer); frame.innerHTML = ""; });
  }

  /* ---- Tìm kiếm ---- */
  var results = $("#sResults");
  if (results) {
    var input = $("#sq"), countEl = $("#sCount"), index = null;
    var norm = function (s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d"); };
    var escH = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
    var run = function () {
      if (!index) return;
      var q = norm(input.value.trim());
      var list = index.filter(function (s) { return !q || norm([s.t, s.g, s.d, s.k].join(" ")).indexOf(q) > -1; });
      countEl.textContent = q ? list.length + " truyện phù hợp với “" + input.value.trim() + "”" : "Tất cả " + list.length + " truyện";
      results.innerHTML = list.map(function (s) {
        return '<a class="card" href="' + results.dataset.pattern.replace("{s}", s.s) + '"><div class="cover" style="--c1:' + s.c1 + ';--c2:' + s.c2 + '"><div class="glyph">' + escH(s.t[0]) + '</div><div class="cg">' + escH(s.g) + '</div><div class="ct">' + escH(s.t) + "</div></div><h3>" + escH(s.t) + "</h3><p>" + s.n + " chương · " + s.m + " phút đọc</p></a>";
      }).join("") || '<div class="empty">Chưa có truyện phù hợp. Thử từ khóa khác nhé.</div>';
    };
    try { input.value = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
    fetch(results.dataset.index).then(function (r) { return r.json(); }).then(function (d) { index = d; run(); })
      .catch(function () { countEl.textContent = "Không tải được danh sách truyện. Bạn tải lại trang thử nhé."; });
    $("#searchPage").addEventListener("submit", function (e) { e.preventDefault(); run(); });
    input.addEventListener("input", run);
  }

  /* ---- Nút sao chép ---- */
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.dataset.copy), txt = el.textContent;
      var done = function () { b.textContent = "Đã chép"; setTimeout(function () { b.textContent = "Sao chép"; }, 1500); };
      var select = function () { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); };
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, select); else select();
    });
  });
})();
