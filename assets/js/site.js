(function () {
  var header = document.querySelector(".docs-header");
  var toggle = document.querySelector(".docs-menu-toggle");

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

  // ---- Keyword search across all docs pages ----
  var scriptEl = document.querySelector('script[src*="site.js"]');
  var siteBase = scriptEl ? scriptEl.src.replace(/assets\/js\/site\.js.*$/, "") : "";
  var searchIndex = [];
  var searchReady = false;
  var searchBoxes = Array.prototype.slice.call(document.querySelectorAll(".docs-search"));
  var searchInputs = searchBoxes.map(function (box) {
    return box.querySelector(".docs-search-input");
  });
  var activeBox = searchBoxes[0] || null;
  var selected = -1;

  fetch(siteBase + "assets/js/search-index.json")
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (data) {
      searchIndex = data || [];
      searchReady = true;
      searchInputs.forEach(function (input) {
        if (input && input.value.trim()) renderSearch(input.value, boxOf(input));
      });
    })
    .catch(function () { searchReady = true; searchIndex = []; });

  function boxOf(input) {
    return input.closest(".docs-search");
  }

  function tokenize(q) {
    return String(q || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  function words(s) {
    return tokenize(s);
  }

  function editDistance(a, b) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > 1) return 99;
    var i, j;
    if (a.length === b.length) {
      var diffs = 0;
      for (i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diffs > 1) return 99;
      return diffs;
    }
    if (a.length > b.length) { var t = a; a = b; b = t; }
    // a is shorter by 1: one insertion into a (deletion from b)
    j = 0;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i + j]) {
        if (j) return 99;
        j = 1;
        i--;
      }
    }
    return 1;
  }

  function tokenMatch(token, word) {
    if (!token || !word) return null;
    if (word === token) return { type: "exact", score: 3 };
    if (token.length >= 2 && word.startsWith(token)) return { type: "prefix", score: 2 };
    if (token.length >= 2 && word.length >= 3 && token.startsWith(word)) return { type: "prefix", score: 1.5 };
    if (token.length >= 4 && word.length >= 4 && editDistance(token, word) <= 1) return { type: "fuzzy", score: 1 };
    return null;
  }

  function bestTokenMatch(token, text) {
    var best = null;
    words(text).forEach(function (w) {
      var m = tokenMatch(token, w);
      if (m && (!best || m.score > best.score)) best = m;
    });
    return best;
  }

  function searchDocs(query) {
    var tokens = tokenize(query);
    if (!tokens.length) return [];
    var results = [];
    searchIndex.forEach(function (rec) {
      var titleField = (rec.title || "") + " " + (rec.aliases || "");
      var bodyField = rec.text || "";
      var score = 0;
      var titleHits = 0;
      for (var i = 0; i < tokens.length; i++) {
        var tm = bestTokenMatch(tokens[i], titleField);
        var bm = tm ? null : bestTokenMatch(tokens[i], bodyField);
        if (!tm && !bm) return;
        if (tm) {
          titleHits++;
          score += tm.score * 10;
        } else {
          score += bm.score;
        }
      }
      var phrase = query.trim().toLowerCase();
      if (phrase.length >= 3) {
        if ((rec.title || "").toLowerCase().indexOf(phrase) !== -1) score += 20;
        else if ((rec.text || "").toLowerCase().indexOf(phrase) !== -1) score += 4;
      }
      results.push({
        rec: rec,
        score: score,
        where: titleHits ? "heading" : "body",
        titleHits: titleHits
      });
    });
    results.sort(function (a, b) {
      if (a.where !== b.where) return a.where === "heading" ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return (a.rec.title || "").length - (b.rec.title || "").length;
    });
    return results.slice(0, 12);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function highlight(text, tokens) {
    return String(text).replace(/([A-Za-z0-9]+)|([^A-Za-z0-9]+)/g, function (all, word, sep) {
      if (sep) return escapeHtml(sep);
      var w = word.toLowerCase();
      var hit = tokens.some(function (t) { return tokenMatch(t, w); });
      if (hit) return "<mark>" + escapeHtml(word) + "</mark>";
      return escapeHtml(word);
    });
  }

  function makeSnippet(text, tokens) {
    var raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    var pos = -1;
    var lower = raw.toLowerCase();
    tokens.forEach(function (t) {
      var re = new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      var m = re.exec(raw);
      if (m && (pos === -1 || m.index < pos)) pos = m.index;
      else {
        // fuzzy: find a close word
        var parts = raw.split(/([^A-Za-z0-9]+)/);
        var cursor = 0;
        for (var i = 0; i < parts.length; i++) {
          if (tokenMatch(t, parts[i].toLowerCase()) && (pos === -1 || cursor < pos)) pos = cursor;
          cursor += parts[i].length;
        }
      }
    });
    if (pos < 0) pos = 0;
    var start = Math.max(0, pos - 42);
    var end = Math.min(raw.length, start + 150);
    var slice = (start > 0 ? "…" : "") + raw.slice(start, end) + (end < raw.length ? "…" : "");
    return highlight(slice, tokens);
  }

  function resultHref(rec) {
    var path = rec.url === "./" ? "" : rec.url || "";
    return siteBase + path + (rec.anchor ? "#" + rec.anchor : "");
  }

  function closePanel(box) {
    var panel = box && box.querySelector(".docs-search-panel");
    if (panel) {
      panel.hidden = true;
      panel.innerHTML = "";
    }
    selected = -1;
  }

  function closeAll() {
    searchBoxes.forEach(closePanel);
  }

  function hitsOf(box) {
    var panel = box.querySelector(".docs-search-panel");
    return panel ? Array.prototype.slice.call(panel.querySelectorAll(".docs-search-hit")) : [];
  }

  function setSelected(box, index) {
    var hits = hitsOf(box);
    if (!hits.length) { selected = -1; return; }
    if (index < 0) index = hits.length - 1;
    if (index >= hits.length) index = 0;
    selected = index;
    hits.forEach(function (el, i) {
      el.classList.toggle("is-selected", i === selected);
      if (i === selected) el.setAttribute("aria-selected", "true");
      else el.removeAttribute("aria-selected");
    });
    hits[selected].scrollIntoView({ block: "nearest" });
  }

  function renderSearch(query, box) {
    if (!box) return;
    var panel = box.querySelector(".docs-search-panel");
    if (!panel) return;
    var q = String(query || "").trim();
    selected = -1;
    if (!q) {
      closePanel(box);
      return;
    }
    if (!searchReady) {
      panel.hidden = false;
      panel.innerHTML = '<div class="docs-search-results"><p>Loading…</p></div>';
      return;
    }
    var results = searchDocs(q);
    var tokens = tokenize(q);
    var html = '<div class="docs-search-results" role="listbox">';
    if (!results.length) {
      html += '<p class="docs-search-empty-msg">No results</p>';
    } else {
      results.forEach(function (item, i) {
        var rec = item.rec;
        var snippet = makeSnippet(rec.text, tokens);
        html +=
          '<a class="docs-search-hit" role="option" href="' +
          escapeHtml(resultHref(rec)) +
          '" data-index="' + i + '">' +
          '<span class="docs-search-page">' + escapeHtml(rec.page) + "</span>" +
          "<strong>" + highlight(rec.title, tokens) + "</strong>" +
          (snippet ? '<span class="docs-search-snippet">' + snippet + "</span>" : "") +
          "</a>";
      });
    }
    html += "</div>";
    panel.innerHTML = html;
    panel.hidden = false;
    if (results.length) setSelected(box, 0);
  }

  searchBoxes.forEach(function (box) {
    var input = box.querySelector(".docs-search-input");
    if (!input) return;
    input.setAttribute("aria-autocomplete", "list");
    input.addEventListener("input", function () {
      var val = input.value;
      searchInputs.forEach(function (other) {
        if (other !== input) other.value = val;
      });
      searchBoxes.forEach(function (b) {
        if (b !== box) closePanel(b);
      });
      renderSearch(val, box);
    });
    input.addEventListener("focus", function () {
      activeBox = box;
      if (input.value.trim()) renderSearch(input.value, box);
    });
    input.addEventListener("keydown", function (e) {
      var panel = box.querySelector(".docs-search-panel");
      var open = panel && !panel.hidden;
      if (e.key === "Escape") {
        e.preventDefault();
        if (open) closePanel(box);
        else { input.value = ""; searchInputs.forEach(function (o) { o.value = ""; }); }
        input.blur();
        return;
      }
      if (e.key === "ArrowDown") {
        if (!open && input.value.trim()) renderSearch(input.value, box);
        e.preventDefault();
        setSelected(box, selected + 1);
        return;
      }
      if (e.key === "ArrowUp") {
        if (!open && input.value.trim()) renderSearch(input.value, box);
        e.preventDefault();
        setSelected(box, selected - 1);
        return;
      }
      if (e.key === "Enter") {
        var hits = hitsOf(box);
        if (hits.length) {
          e.preventDefault();
          var target = hits[selected] || hits[0];
          target.click();
        }
      }
    });
  });

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      var visible = searchInputs.filter(function (i) {
        return i && i.offsetParent !== null;
      })[0] || searchInputs[0];
      if (visible) {
        e.preventDefault();
        visible.focus();
        visible.select();
        activeBox = boxOf(visible);
        if (visible.value.trim()) renderSearch(visible.value, activeBox);
      }
    }
  });

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".docs-search")) closeAll();
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
