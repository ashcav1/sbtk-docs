/* SBTK documentation: search, copy buttons, collapsed sections opened by links, reading
   position kept across back/forward, page contents highlighting, narrow-screen navigation. */
(function () {
  "use strict";
  var root = document.documentElement.getAttribute("data-root") || "./";

  /* ---------------------------------------------------------------- collapsed sections */
  function openAncestors(el) {
    for (var p = el; p; p = p.parentElement) {
      if (p.tagName === "DETAILS") p.open = true;
    }
  }
  function target(hash) {
    if (!hash || hash.length < 2) return null;
    var id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) { id = hash.slice(1); }
    return document.getElementById(id);
  }
  function showTarget(hash, smooth) {
    var el = target(hash);
    if (!el) return false;
    openAncestors(el);
    if (el.tagName === "DETAILS") el.open = true;
    el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    return true;
  }
  function openIds() {
    return Array.prototype.map.call(document.querySelectorAll("details[open][id]"), function (d) { return d.id; });
  }

  /* ---------------------------------------------------------------- reading position */
  // Every history entry stores its scroll position and open sections; back/forward restores both.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  function saveState() {
    var s = history.state && typeof history.state === "object" ? history.state : {};
    var next = { y: window.scrollY, open: openIds(), sbtk: 1 };
    if (s.y === next.y && JSON.stringify(s.open) === JSON.stringify(next.open)) return;
    try { history.replaceState(next, ""); } catch (e) { /* rate-limited: keep the previous state */ }
  }
  function restore(state) {
    if (!state || state.sbtk !== 1) return false;
    (state.open || []).forEach(function (id) {
      var d = document.getElementById(id);
      if (d && d.tagName === "DETAILS") d.open = true;
    });
    window.scrollTo(0, state.y || 0);
    return true;
  }
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  var traversal = nav && nav.type === "back_forward";
  function initialPosition() {
    if (traversal && restore(history.state)) return;
    if (location.hash) showTarget(location.hash, false);
  }
  var timer = null;
  window.addEventListener("scroll", function () {
    clearTimeout(timer);
    timer = setTimeout(saveState, 250);
  }, { passive: true });
  window.addEventListener("pagehide", saveState);
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    saveState();                               // position of the entry we are leaving
    var url = new URL(a.href, location.href);
    if (url.pathname === location.pathname && url.hash && !e.defaultPrevented &&
        !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      history.pushState(null, "", url.hash);
      showTarget(url.hash, false);
      saveState();
    }
  });
  window.addEventListener("popstate", function (e) {
    if (!restore(e.state) && location.hash) showTarget(location.hash, false);
  });
  window.addEventListener("hashchange", function () {
    if (!history.state || history.state.sbtk !== 1) showTarget(location.hash, false);
  });
  document.addEventListener("toggle", function () { saveState(); }, true);

  /* ---------------------------------------------------------------- copy buttons */
  document.querySelectorAll(".codeblock .copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var code = b.closest(".codeblock").querySelector("pre").innerText;
      function done(ok) {
        b.textContent = ok ? "Copied" : "Select and copy";
        setTimeout(function () { b.textContent = "Copy"; }, 1600);
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(code).then(function () { done(true); }, function () { done(fallback(code)); });
      } else {
        done(fallback(code));
      }
    });
  });
  function fallback(text) {
    var t = document.createElement("textarea");
    t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(t);
    return ok;
  }

  /* ---------------------------------------------------------------- narrow-screen navigation */
  var toggle = document.querySelector(".navtoggle"), side = document.getElementById("sidebar");
  if (toggle && side) {
    toggle.addEventListener("click", function () {
      var bar = document.querySelector(".topbar");
      if (bar) side.style.top = bar.getBoundingClientRect().bottom + "px";
      var open = side.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { var cur = side.querySelector("a.current") || side.querySelector("a"); if (cur) cur.focus(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && side.classList.contains("open")) {
        side.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); toggle.focus();
      }
    });
  }
  var cur = side && side.querySelector("a.current");
  if (cur && window.innerWidth > 860) side.scrollTop = Math.max(0, cur.offsetTop - side.clientHeight / 2);

  /* ---------------------------------------------------------------- page contents */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".pagetoc a"));
  var heads = tocLinks.map(function (a) { return target(a.getAttribute("href")); });
  function spy() {
    var y = window.scrollY + 90, k = -1;
    for (var i = 0; i < heads.length; i++) { if (heads[i] && heads[i].getBoundingClientRect().top + window.scrollY <= y) k = i; }
    tocLinks.forEach(function (a, i) { a.classList.toggle("active", i === k); });
  }
  if (tocLinks.length) { window.addEventListener("scroll", spy, { passive: true }); }

  /* ---------------------------------------------------------------- printing */
  function openAll() { document.querySelectorAll("details").forEach(function (d) { d.open = true; }); }
  window.addEventListener("beforeprint", openAll);
  if (document.body.classList.contains("printdoc")) openAll();

  /* ---------------------------------------------------------------- search */
  var input = document.getElementById("search-input"), list = document.getElementById("search-results");
  var data = window.SBTK_SEARCH || [];
  var items = data.map(function (d) {
    return { d: d, t: d.t.toLowerCase(), s: (d.s || "").toLowerCase(), p: (d.p || "").toLowerCase() };
  });
  var kindRank = { Function: 0, Structure: 1, Page: 1, Section: 2, Argument: 3, Field: 3, Output: 4, Error: 4, Internal: 5 };
  var shown = [], sel = -1;
  function score(it, q, words) {
    var s = 0;
    if (it.t === q) s += 100;
    var last = it.t.split(/[.›>( ]/).filter(Boolean).pop() || it.t;
    if (last === q || last === q.split(".").pop()) s += 60;
    if (it.t.indexOf(q) === 0) s += 30;
    else if (it.t.indexOf(q) >= 0) s += 20;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (it.t.indexOf(w) >= 0) s += 8;
      else if (it.s.indexOf(w) >= 0 || it.p.indexOf(w) >= 0) s += 3;
      else return 0;
    }
    return s - (kindRank[it.d.k] || 0);
  }
  function render() {
    var q = input.value.trim().toLowerCase();
    list.innerHTML = ""; shown = []; sel = -1;
    if (!q) { list.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
    var words = q.split(/\s+/);
    var scored = [];
    for (var i = 0; i < items.length; i++) {
      var s = score(items[i], q, words);
      if (s > 0) scored.push([s, items[i]]);
    }
    scored.sort(function (a, b) { return b[0] - a[0] || a[1].t.length - b[1].t.length; });
    shown = scored.slice(0, 25).map(function (x) { return x[1].d; });
    if (!shown.length) {
      var li = document.createElement("li"); li.className = "empty"; li.textContent = "No matches";
      list.appendChild(li);
    }
    shown.forEach(function (d, i) {
      var li = document.createElement("li");
      li.id = "sr-" + i; li.setAttribute("role", "option");
      var t = document.createElement("span"); t.className = "r-title"; t.textContent = d.t;
      var k = document.createElement("span"); k.className = "r-kind"; k.textContent = d.k; t.appendChild(k);
      var p = document.createElement("span"); p.className = "r-path"; p.textContent = d.p;
      li.appendChild(t); li.appendChild(p);
      if (d.s) { var sn = document.createElement("span"); sn.className = "r-snip"; sn.textContent = d.s; li.appendChild(sn); }
      li.addEventListener("mousedown", function (e) { e.preventDefault(); go(i); });
      list.appendChild(li);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    select(shown.length ? 0 : -1);
  }
  function select(i) {
    sel = i;
    Array.prototype.forEach.call(list.children, function (li, j) { li.setAttribute("aria-selected", j === i ? "true" : "false"); });
    if (i >= 0) { input.setAttribute("aria-activedescendant", "sr-" + i); list.children[i].scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  }
  function go(i) {
    var d = shown[i];
    if (!d) return;
    saveState();
    var url = new URL(root + d.u, location.href);
    list.hidden = true; input.setAttribute("aria-expanded", "false");
    if (url.pathname === location.pathname) {
      history.pushState(null, "", url.hash);
      showTarget(url.hash, false);
      saveState();
    } else {
      location.href = url.href;
    }
  }
  if (input) {
    input.addEventListener("input", render);
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { if (shown.length) select(Math.min(sel + 1, shown.length - 1)); e.preventDefault(); }
      else if (e.key === "ArrowUp") { if (shown.length) select(Math.max(sel - 1, 0)); e.preventDefault(); }
      else if (e.key === "Enter") { if (sel >= 0) go(sel); e.preventDefault(); }
      else if (e.key === "Escape") { input.value = ""; render(); input.blur(); }
    });
    input.addEventListener("blur", function () { setTimeout(function () { list.hidden = true; input.setAttribute("aria-expanded", "false"); }, 150); });
    input.addEventListener("focus", function () { if (input.value.trim()) render(); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) {
        input.focus(); e.preventDefault();
      }
    });
  }

  /* the page is complete: open what the URL or the history entry asks for */
  initialPosition();
  spy && tocLinks.length && spy();
})();
