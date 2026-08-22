/* ==========================================================
   kaixinbuilds — site logic
   Loads content from JSON, renders it, and swaps language
   without a reload. No dependencies, no build step.
   ========================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'kb-lang';
  const LANGS = ['en', 'zh'];

  /** Everything loaded from disk lives here so re-rendering is cheap. */
  const data = { i18n: {}, projects: [], talks: [] };

  let lang = pickInitialLang();

  /* ── helpers ─────────────────────────────────────────── */

  function pickInitialLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
    return navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  /** Look up a translated string by key; falls back to English, then the key. */
  const t = (key) => {
    const entry = data.i18n[key];
    if (!entry) return key;
    return entry[lang] ?? entry.en ?? key;
  };

  /** Pick the right side of a { en, zh } pair coming from projects/talks JSON. */
  const pick = (pair) => {
    if (pair == null) return '';
    if (typeof pair === 'string') return pair;
    return pair[lang] ?? pair.en ?? '';
  };

  const esc = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const $ = (sel) => document.querySelector(sel);

  /* ── i18n application ────────────────────────────────── */

  function applyI18n() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';

    // data-i18n + optional data-i18n-attr ("content", "placeholder", …).
    // Without data-i18n-attr the string becomes the element's text.
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const value = t(el.dataset.i18n);
      const attr = el.dataset.i18nAttr;
      if (attr) el.setAttribute(attr, value);
      else el.textContent = value;
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
  }

  /* ── rendering ───────────────────────────────────────── */

  function renderFeatured() {
    const host = $('#featured');
    const p = data.projects.find((item) => item.featured);
    if (!host || !p) return;

    const stats = (p.stats || []).map((s) => `
      <li>
        <span class="value">${esc(s.value)}</span>
        <span class="label">${esc(pick(s.label))}</span>
      </li>`).join('');

    const shots = (p.screenshots || []).map((s) => {
      const caption = esc(pick(s.caption));
      return `
      <figure class="shot">
        <div class="screen-bezel">
          <div class="screen-inner" data-missing="${esc(s.src)}">
            <img src="${esc(s.src)}" alt="${caption}" loading="lazy" decoding="async">
          </div>
        </div>
        <figcaption>${caption}</figcaption>
      </figure>`;
    }).join('');

    const isLive = (p.tags || []).includes('live');

    host.innerHTML = `
      <div class="featured-head">
        <p class="eyebrow">${esc(t('featured.eyebrow'))}</p>
        <div class="featured-titlerow">
          <h2 class="featured-title">${esc(pick(p.title))}</h2>
          ${isLive ? '<span class="badge-live">LIVE</span>' : ''}
        </div>
        <p class="featured-subtitle">${esc(pick(p.subtitle))}</p>
        <p class="featured-summary">${esc(pick(p.summary))}</p>
        ${stats ? `<ul class="stats">${stats}</ul>` : ''}
        ${p.highlight ? `
        <div class="highlight-box">
          <span class="label">${esc(t('featured.highlightLabel'))}</span>
          <p>${esc(pick(p.highlight))}</p>
        </div>` : ''}
        ${p.link ? `
        <p class="featured-cta">
          <a class="btn btn-primary" href="${esc(p.link)}" target="_blank" rel="noopener">
            ${esc(t('featured.visit'))}
          </a>
        </p>` : ''}
      </div>
      ${shots ? `<div class="shots">${shots}</div>` : ''}`;

    revealLoadedImages(host);
  }

  /** Figures start in their fallback state and are revealed only once the
      image actually loads. Inverted deliberately: a lazy-loaded image that is
      missing never fires an error, so "hide on error" would leave an empty
      frame on the page forever. */
  function revealLoadedImages(root = document) {
    root.querySelectorAll('.shot img, .specimen img').forEach((img) => {
      const figure = img.closest('.shot, .specimen');
      const ready = () => figure.classList.add('is-loaded');
      if (img.complete && img.naturalWidth > 0) ready();
      else img.addEventListener('load', ready, { once: true });
    });
  }

  function renderGrid() {
    const host = $('#project-grid');
    if (!host) return;

    host.innerHTML = data.projects
      .filter((p) => !p.featured)
      .map((p) => {
        const tags = (p.tags || [])
          .map((tag, i) => `<li class="tag${i === 0 ? ' accent' : ''}">${esc(tag)}</li>`)
          .join('');
        const link = p.link
          ? `<a class="card-link" href="${esc(p.link)}" target="_blank" rel="noopener">${esc(t('grid.visit'))} →</a>`
          : `<span class="card-link" aria-disabled="true">${esc(t('grid.noLink'))}</span>`;
        return `
        <article class="card">
          <h3>${esc(pick(p.title))}</h3>
          <p>${esc(pick(p.summary))}</p>
          <div class="card-foot">
            <ul class="tags">${tags}</ul>
            ${link}
          </div>
        </article>`;
      }).join('');
  }

  function renderTalks() {
    const host = $('#talks-list');
    if (!host) return;

    // Newest first, so the freshest talk is the first thing read.
    const sorted = [...data.talks].sort((a, b) => String(b.date).localeCompare(String(a.date)));

    host.innerHTML = sorted.map((talk) => {
      const status = talk.status === 'upcoming' ? 'upcoming' : 'completed';
      return `
      <li>
        <div class="talk-meta">
          ${esc(pick(talk.dateLabel) || talk.date)}
          <span class="talk-status ${status}">${esc(t('talks.' + status))}</span>
        </div>
        <div class="talk-body">
          <h3>${esc(pick(talk.title))}</h3>
          <p class="talk-venue">${esc(pick(talk.venue))}</p>
          ${talk.summary ? `<p class="talk-summary">${esc(pick(talk.summary))}</p>` : ''}
          ${talk.link ? `<p><a class="talk-link" href="${esc(talk.link)}" target="_blank" rel="noopener">${esc(t('talks.viewLink'))} →</a></p>` : ''}
        </div>
      </li>`;
    }).join('');
  }

  function renderAll() {
    applyI18n();
    renderFeatured();
    renderGrid();
    renderTalks();
  }

  /* ── language toggle ─────────────────────────────────── */

  function initToggle() {
    const btn = $('#lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      lang = lang === 'en' ? 'zh' : 'en';
      localStorage.setItem(STORAGE_KEY, lang);
      renderAll();
    });
  }

  /* ── boot ────────────────────────────────────────────── */

  async function loadJSON(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    return response.json();
  }

  function showLoadError(err) {
    console.error('Content failed to load:', err);
    const host = $('#featured');
    if (!host) return;
    host.innerHTML = `
      <div class="data-error">
        <h3>${esc(t('error.dataTitle') === 'error.dataTitle' ? 'Content could not load' : t('error.dataTitle'))}</h3>
        <p>${esc(t('error.dataBody') === 'error.dataBody'
          ? 'This page reads its content from JSON files, which browsers block when a page is opened directly from disk. Serve the folder over HTTP instead — see README.md.'
          : t('error.dataBody'))}</p>
      </div>`;
  }

  (async () => {
    try {
      const [i18n, projects, talks] = await Promise.all([
        loadJSON('i18n.json'),
        loadJSON('projects.json'),
        loadJSON('talks.json'),
      ]);
      data.i18n = i18n;
      data.projects = projects;
      data.talks = talks;
      renderAll();
    } catch (err) {
      showLoadError(err);
    }
    revealLoadedImages();
    initToggle();
  })();
})();
