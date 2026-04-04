(function () {
  const script = document.currentScript;
  const indexPath = script?.dataset.searchIndex || "data/site-search-index.json";
  const siteBaseUrl = script?.src ? new URL("../", script.src) : new URL("./", window.location.href);

  function normalize(value) {
    return (value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  }

  function resolveUrl(url) {
    return new URL(url, siteBaseUrl).toString();
  }

  function scoreEntry(entry, terms) {
    const title = normalize(entry.title);
    const section = normalize(entry.section);
    const page = normalize(entry.page);
    const snippet = normalize(entry.snippet);
    const keywords = normalize((entry.keywords || []).join(" "));
    const haystack = [title, section, page, snippet, keywords].join(" ");
    let score = 0;

    for (const term of terms) {
      if (!haystack.includes(term)) return 0;
      if (title.includes(term)) score += 14;
      if (section.includes(term)) score += 10;
      if (keywords.includes(term)) score += 8;
      if (page.includes(term)) score += 6;
      if (snippet.includes(term)) score += 4;
    }

    if (terms.length && title.includes(terms.join(" "))) score += 10;
    return score;
  }

  function buildMarkup() {
    const host = document.createElement("div");
    host.className = "site-search-shell";
    host.innerHTML = `
      <div class="site-search-wrap">
        <div class="site-search-bar">
          <div class="site-search-icon" aria-hidden="true">🔎</div>
          <div class="site-search-copy">
            <label class="site-search-label" for="site-search-input">Search the MMMF site</label>
            <input id="site-search-input" class="site-search-input" type="search" autocomplete="off" placeholder="Search portal, workbook, registration, PLRR, scenario cards..." />
          </div>
          <div class="site-search-hint">Press Enter to open the best match</div>
        </div>
        <div class="site-search-results" id="site-search-results" hidden></div>
      </div>
    `;
    return host;
  }

  async function init() {
    const utilityBar = document.querySelector(".utility-bar");
    const anchor = utilityBar || document.querySelector("header, .site-header");
    const shell = buildMarkup();
    if (utilityBar) {
      shell.classList.add("site-search-inline");
      utilityBar.insertAdjacentElement("afterbegin", shell);
    } else if (anchor && anchor.parentNode) {
      anchor.insertAdjacentElement("afterend", shell);
    }
    else document.body.insertAdjacentElement("afterbegin", shell);

    const input = document.getElementById("site-search-input");
    const results = document.getElementById("site-search-results");
    let entries = [];

    try {
      const response = await fetch(new URL(indexPath, window.location.href));
      entries = await response.json();
    } catch (_error) {
      results.hidden = false;
      results.innerHTML = `<div class="site-search-state">The search index could not load on this page yet.</div>`;
      return;
    }

    function clearResults() {
      results.hidden = true;
      results.innerHTML = "";
    }

    function render(items, query) {
      if (!query) {
        clearResults();
        return;
      }

      if (!items.length) {
        results.hidden = false;
        results.innerHTML = `<div class="site-search-empty">No exact site matches yet for "<strong>${query}</strong>". Try a page name, document title, framework, or program term.</div>`;
        return;
      }

      results.hidden = false;
      results.innerHTML = `
        <ul class="site-search-list">
          ${items.map((item) => `
            <li class="site-search-item">
              <a class="site-search-link" href="${resolveUrl(item.url)}">
                <div class="site-search-topline">
                  <span class="site-search-title">${item.title}</span>
                  <span class="site-search-meta">${item.page}${item.section ? " · " + item.section : ""}</span>
                </div>
                <div class="site-search-snippet">${item.snippet}</div>
              </a>
            </li>
          `).join("")}
        </ul>
      `;
    }

    function search(query) {
      const normalized = normalize(query);
      if (!normalized) return [];
      const terms = normalized.split(" ").filter(Boolean);
      return entries
        .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((item) => item.entry);
    }

    input.addEventListener("input", () => {
      const query = input.value.trim();
      render(search(query), query);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const best = search(input.value.trim())[0];
        if (best) {
          window.location.href = resolveUrl(best.url);
        }
      }
      if (event.key === "Escape") {
        clearResults();
        input.blur();
      }
    });

    document.addEventListener("click", (event) => {
      if (!shell.contains(event.target)) clearResults();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
