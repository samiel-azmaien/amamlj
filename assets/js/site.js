(function () {
  var header = document.querySelector(".docs-header");
  var toggle = document.querySelector(".docs-menu-toggle");

  // Header: becomes the floating capsule after scrolling, like totemlayer.com/docs
  function onScroll() {
    if (header) header.setAttribute("data-scrolled", window.scrollY > 8 ? "true" : "false");
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  if (toggle && header) {
    toggle.addEventListener("click", function () {
      var open = header.getAttribute("data-menu-open") !== "true";
      header.setAttribute("data-menu-open", open ? "true" : "false");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // Sidebar search filter (works on every copy of the sidebar)
  var inputs = Array.prototype.slice.call(document.querySelectorAll(".docs-search-input"));
  inputs.forEach(function (input) {
    var nav = input.closest(".docs-sidebar-content").querySelector(".docs-navigation");
    var groups = Array.prototype.slice.call(nav.querySelectorAll("details"));
    var initialOpen = groups.map(function (d) { return d.open; });
    var empty = nav.querySelector(".docs-search-empty");
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var any = false;
      nav.querySelectorAll(":scope > a.docs-overview").forEach(function (a) {
        var hit = !q || a.textContent.toLowerCase().indexOf(q) !== -1;
        a.hidden = !hit; if (hit) any = true;
      });
      groups.forEach(function (d, i) {
        var title = d.querySelector("summary").textContent.toLowerCase();
        var titleHit = q && title.indexOf(q) !== -1;
        var links = d.querySelectorAll(".docs-navigation-group a");
        var count = 0;
        links.forEach(function (a) {
          var hit = !q || titleHit || a.textContent.toLowerCase().indexOf(q) !== -1;
          a.hidden = !hit; if (hit) count++;
        });
        d.hidden = q && count === 0;
        d.open = q ? count > 0 : initialOpen[i];
        if (count) any = true;
      });
      if (empty) empty.hidden = !q || any;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; input.dispatchEvent(new Event("input")); input.blur(); }
      if (e.key === "Enter") {
        var first = nav.querySelector("a:not([hidden])");
        if (first && input.value.trim()) { e.preventDefault(); first.click(); }
      }
    });
  });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      var visible = inputs.filter(function (i) { return i.offsetParent !== null; })[0];
      if (visible) { e.preventDefault(); visible.focus(); visible.select(); }
    }
  });

  // Right rail "On this page" + scrollspy
  var outline = document.querySelector(".docs-outline");
  var sections = Array.prototype.slice.call(document.querySelectorAll(".docs-article .docs-section[id][data-toc]"));
  var outlineLinks = [];
  if (outline) {
    sections.forEach(function (s) {
      var a = document.createElement("a");
      a.href = "#" + s.id;
      a.textContent = s.getAttribute("data-toc");
      outline.appendChild(a);
      outlineLinks.push(a);
    });
  }
  var sideLinks = Array.prototype.slice.call(document.querySelectorAll(".docs-navigation-group a")).filter(function (a) {
    var h = a.getAttribute("href") || ""; return h.charAt(0) === "#";
  });
  function spy() {
    var current = sections.length ? sections[0].id : null;
    sections.forEach(function (s) { if (s.getBoundingClientRect().top <= 140) current = s.id; });
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && sections.length) current = sections[sections.length - 1].id;
    outlineLinks.forEach(function (a) {
      if (a.getAttribute("href") === "#" + current) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    sideLinks.forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("href") === "#" + current); });
  }
  spy();
  window.addEventListener("scroll", spy, { passive: true });
  window.addEventListener("resize", spy);

  // Copy buttons on code blocks
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var sel = btn.getAttribute("data-copy");
      var el = sel ? document.querySelector(sel) : btn.closest(".docs-code-block").querySelector("code");
      if (!el) return;
      try {
        await navigator.clipboard.writeText(el.textContent);
        btn.dataset.copied = "true";
        var prev = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = prev; delete btn.dataset.copied; }, 1600);
      } catch (err) { btn.textContent = "Copy failed"; }
    });
  });
})();
