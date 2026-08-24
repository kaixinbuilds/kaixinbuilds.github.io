/* ==========================================================
   kaixinbuilds — site logic
   Loads content from JSON, renders it, and swaps language
   without a reload. No dependencies, no build step.
   ========================================================== */

(() => {
  'use strict';

  const STORAGE_KEY = 'kb-lang';
  const LANGS = ['zh', 'both', 'en'];

  /** Everything loaded from disk lives here so re-rendering is cheap. */
  const data = { i18n: {}, projects: [], talks: [] };

  let lang = pickInitialLang();

  /* ── helpers ─────────────────────────────────────────── */

  function pickInitialLang() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
    return 'both';          // serves both audiences until someone chooses
  }

  /** Look up a translated string by key; falls back to English, then the key. */
  const t = (key) => {
    const entry = data.i18n[key];
    if (!entry) return key;
    return pick(entry) || key;
  };

  /** Escaped markup for a key, both languages in bilingual mode. */
  const tb = (key) => {
    const entry = data.i18n[key];
    return entry ? bi(entry) : esc(key);
  };

  /** One language only. Used for attributes and <title>, which cannot hold
      two languages. In bilingual mode this falls back to Chinese. */
  const pick = (pair) => {
    if (pair == null) return '';
    if (typeof pair === 'string') return pair;
    if (lang === 'both') return pair.zh ?? pair.en ?? '';
    return pair[lang] ?? pair.en ?? '';
  };

  /** Escaped markup for visible text. In bilingual mode both languages are
      emitted, Chinese first, so neither reads as a translation of the other. */
  const bi = (pair) => {
    if (pair == null) return '';
    if (typeof pair === 'string') return esc(pair);
    if (lang !== 'both') return esc(pick(pair));
    const zh = pair.zh, en = pair.en;
    if (!zh || !en || zh === en) return esc(zh || en || '');
    return `<span class="bi-zh" lang="zh-Hans">${esc(zh)}</span>`
         + `<span class="bi-en" lang="en">${esc(en)}</span>`;
  };

  const esc = (str) => String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const $ = (sel) => document.querySelector(sel);

  /* ── i18n application ────────────────────────────────── */

  function applyI18n() {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-Hans';
    document.documentElement.dataset.langMode = lang;

    // data-i18n + optional data-i18n-attr ("content", "placeholder", …).
    // Attributes and <title> can only hold one language, so they take pick();
    // everything visible takes both in bilingual mode.
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const attr = el.dataset.i18nAttr;
      if (attr) { el.setAttribute(attr, t(key)); return; }
      if (el.tagName === 'TITLE') { el.textContent = t(key); return; }
      el.innerHTML = tb(key);
    });

    // The wordmark is a brand, not copy: it shows one form, not a stacked
    // pair. In bilingual mode the Chinese name leads and the latin one
    // follows quietly, since the address is still kaixinbuilds.
    const wordmark = $('#wordmark-text');
    if (wordmark && data.i18n['brand.a']) {
      // Both names, always: the Chinese name carries the meaning and the
      // latin one is the address people type, so neither can be hidden.
      const a = data.i18n['brand.a'], b = data.i18n['brand.b'];
      wordmark.innerHTML =
        `<span lang="zh-Hans">${esc(a.zh)}<em>${esc(b.zh)}</em></span>`
        + `<span class="wordmark-latin">${esc(a.en + b.en)}</span>`;
    }

    document.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
    });
  }

  /* ── rendering ───────────────────────────────────────── */

  /** The body of one project, used for every panel. */
  function projectPanel(p) {
    const isLive = (p.tags || []).includes('live');

    const stats = (p.stats || []).map((s) => `
      <li>
        <span class="value">${esc(s.value)}</span>
        <span class="label">${bi(s.label)}</span>
      </li>`).join('');

    const shots = (p.screenshots || []).map((s) => {
      const altText = esc(pick(s.caption));
      return `
      <figure class="shot${s.wide ? ' shot-wide' : ''}">
        <div class="screen-bezel">
          <div class="screen-inner" data-missing="${esc(s.src)}">
            <img src="${esc(s.src)}" alt="${altText}" decoding="async">
          </div>
        </div>
        <figcaption>${bi(s.caption)}</figcaption>
      </figure>`;
    }).join('');

    const links = (p.links || []).map((l) =>
      `<a href="${esc(l.url)}" target="_blank" rel="noopener">${bi(l.label)} \u2192</a>`
    ).join('');

    return `
      <article class="project-panel" id="${esc(p.id)}" data-project="${esc(p.id)}">
        ${p.featured ? `<p class="eyebrow">${tb('featured.eyebrow')}</p>` : ''}
        <div class="featured-titlerow">
          <h2 class="featured-title">${bi(p.title)}</h2>
          ${isLive ? `<span class="badge-live">${tb('status.live')}</span>` : ''}
        </div>
        ${p.subtitle ? `<p class="featured-subtitle">${bi(p.subtitle)}</p>` : ''}
        <p class="featured-summary">${bi(p.summary)}</p>
        ${stats ? `<ul class="stats">${stats}</ul>` : ''}
        ${p.highlight ? `
        <div class="highlight-box">
          <span class="label">${tb('featured.highlightLabel')}</span>
          <p>${bi(p.highlight)}</p>
        </div>` : ''}
        ${p.link ? `
        <p class="featured-cta">
          <a class="btn btn-primary" href="${esc(p.link)}" target="_blank" rel="noopener">
            ${tb('featured.visit')}
          </a>
        </p>
        <p class="project-url">
          <a href="${esc(p.link)}" target="_blank" rel="noopener">${esc(p.displayUrl || p.link)}</a>
        </p>` : ''}
        ${links ? `<p class="project-links">${links}</p>` : ''}
        ${shots ? `<div class="shots">${shots}</div>` : ''}
      </article>`;
  }

  function renderProjects() {
    const nav = $('#project-nav');
    const detail = $('#project-detail');
    if (!nav || !detail) return;

    // flagship first, then the rest in the order they appear in the file
    const list = [...data.projects].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));

    nav.innerHTML = `<ul>${list.map((p) => `
      <li><a href="#${esc(p.id)}" data-project-link="${esc(p.id)}">${bi(p.title)}</a></li>`
    ).join('')}</ul>`;

    detail.innerHTML = list.map(projectPanel).join('');

    const show = (id, push) => {
      const target = list.some((p) => p.id === id) ? id : list[0] && list[0].id;
      if (!target) return;
      detail.querySelectorAll('.project-panel').forEach((el) => {
        el.hidden = el.dataset.project !== target;
      });
      nav.querySelectorAll('[data-project-link]').forEach((a) => {
        const on = a.dataset.projectLink === target;
        a.classList.toggle('is-on', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      if (push && history.replaceState) history.replaceState(null, '', '#' + target);
      revealLoadedImages(detail);
      labelZoomables(detail);
    };

    nav.addEventListener('click', (event) => {
      const a = event.target.closest('[data-project-link]');
      if (!a) return;
      event.preventDefault();
      show(a.dataset.projectLink, true);
    });

    window.addEventListener('hashchange', () => show(location.hash.slice(1), false));
    show(location.hash.slice(1), false);
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

  /** Click to load: the game is only fetched when someone asks for it,
      so the page costs nothing to visitors who scroll past. */
  function wireEmbeds(host) {
    host.querySelectorAll('.embed-play').forEach((button) => {
      button.addEventListener('click', () => {
        const frame = document.createElement('iframe');
        frame.className = 'embed-frame';
        frame.src = button.dataset.embedSrc;
        frame.title = button.dataset.embedTitle;
        frame.loading = 'lazy';
        frame.allow = 'autoplay; fullscreen';
        button.replaceWith(frame);
        frame.focus();
      }, { once: true });
    });
  }

  function talkEntry(talk, open) {
    const status = talk.status === 'upcoming' ? 'upcoming' : 'completed';
    const body = [
      talk.venueUrl
        ? `<p class="talk-venue"><a href="${esc(talk.venueUrl)}" target="_blank" rel="noopener">${bi(talk.venue)}</a></p>`
        : `<p class="talk-venue">${bi(talk.venue)}</p>`,
      talk.summary ? `<p class="talk-summary">${bi(talk.summary)}</p>` : '',
      talk.award ? `<p class="talk-award">${bi(talk.award)}</p>` : '',
      (talk.link || (talk.links || []).length)
        ? `<p class="talk-links">${[
            talk.link ? `<a class="talk-link" href="${esc(talk.link)}" target="_blank" rel="noopener">${tb('talks.viewLink')} \u2192</a>` : '',
            ...(talk.links || []).map((l) =>
              `<a class="talk-link" href="${esc(l.url)}" target="_blank" rel="noopener">${bi(l.label)} \u2192</a>`),
          ].filter(Boolean).join('')}</p>`
        : '',
    ].join('');

    return `
      <li>
        <details class="talk"${open ? ' open' : ''}>
          <summary class="talk-head">
            <span class="talk-date">${esc(pick(talk.dateLabel) || talk.date)}</span>
            <span class="talk-title">${bi(talk.title)}</span>
            <span class="talk-status ${status}">${esc(t('talks.' + status))}</span>
            <span class="talk-chevron" aria-hidden="true"></span>
          </summary>
          <div class="talk-body">${body}</div>
        </details>
      </li>`;
  }

  function renderTalks() {
    const host = $('#talks-list');
    if (!host) return;

    // Upcoming reads forwards from the next thing happening; completed reads
    // backwards from the most recent. Sorting everything one way puts the
    // furthest-off event at the top, which is not how anyone reads a diary.
    const by = (dir) => (a, b) => dir * String(a.date).localeCompare(String(b.date));
    const upcoming = data.talks.filter((x) => x.status === 'upcoming').sort(by(1));
    const completed = data.talks.filter((x) => x.status !== 'upcoming').sort(by(-1));

    const group = (label, items, openFirst) => items.length ? `
      <section class="talk-group">
        <h2 class="talk-group-title">${esc(t(label))}</h2>
        <ol class="talks-list">
          ${items.map((x, i) => talkEntry(x, openFirst && i === 0)).join('')}
        </ol>
      </section>` : '';

    host.innerHTML = group('talks.groupUpcoming', upcoming, true)
                   + group('talks.groupCompleted', completed, upcoming.length === 0);
  }

  /* The images are controls, so they need a name and a focus stop. */
  function labelZoomables(root = document) {
    root.querySelectorAll('.shot img, .specimen img').forEach((img) => {
      img.setAttribute('tabindex', '0');
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `${img.alt || ''} ${t('lightbox.hint')}`.trim());
    });
  }

  function renderAll() {
    applyI18n();
    renderProjects();
    renderTalks();
    labelZoomables();
  }

  /* ── language toggle ─────────────────────────────────── */

  function initToggle() {
    const group = $('#lang-switch');
    if (!group) return;

    const paint = () => {
      group.querySelectorAll('button').forEach((b) => {
        const on = b.dataset.lang === lang;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.classList.toggle('is-on', on);
      });
    };

    group.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-lang]');
      if (!button || button.dataset.lang === lang) return;
      lang = button.dataset.lang;
      localStorage.setItem(STORAGE_KEY, lang);
      renderAll();
      paint();
    });

    paint();
  }

  /* ── lightbox ────────────────────────────────────────── */

  /* One delegated handler for every image on the site, so images added later
     need no wiring. Built on <dialog> for the focus trap and Escape handling
     the browser already implements. */
  function initLightbox() {
    const dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.innerHTML = `
      <button class="lightbox-close" type="button" aria-label=""></button>
      <img alt="">
      <p class="lightbox-caption"></p>`;
    document.body.appendChild(dialog);

    const image = dialog.querySelector('img');
    const caption = dialog.querySelector('.lightbox-caption');
    const close = dialog.querySelector('.lightbox-close');
    close.setAttribute('aria-label', t('lightbox.close'));

    const open = (src, alt, text) => {
      image.src = src;
      image.alt = alt || '';
      caption.textContent = text || '';
      caption.hidden = !text;
      if (typeof dialog.showModal === 'function') dialog.showModal();
    };

    document.addEventListener('click', (event) => {
      const img = event.target.closest('.shot img, .specimen img');
      if (!img || !img.closest('.is-loaded')) return;
      event.preventDefault();
      const figure = img.closest('figure');
      const label = figure && figure.querySelector('figcaption, .specimen-title');
      open(img.currentSrc || img.src, img.alt, label ? label.textContent.trim() : '');
    });

    // keyboard: the figure itself is the control, so give it a real one
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const img = event.target.closest && event.target.closest('.shot img, .specimen img');
      if (!img) return;
      event.preventDefault();
      img.click();
    });

    close.addEventListener('click', () => dialog.close());
    // clicking the backdrop, meaning anywhere that is not the image itself
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => { image.src = ''; });
  }

  /* ── boot ────────────────────────────────────────────── */

  async function loadJSON(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
    return response.json();
  }

  function showLoadError(err) {
    if (err) console.error('Content failed to load:', err);
    const host = $('#project-detail') || $('#talks-list');
    if (!host || host.dataset.errored) return;
    host.dataset.errored = 'true';
    host.insertAdjacentHTML('beforebegin', `
      <div class="data-error">
        <h3>${tb('error.dataTitle')}</h3>
        <p>${tb('error.dataBody')}</p>
      </div>`);
  }

  (async () => {
    // i18n is the only hard dependency: without it nothing has words. The
    // content files are loaded independently so that a broken projects.json
    // cannot leave the community page blank, or vice versa.
    try {
      data.i18n = await loadJSON('i18n.json');
    } catch (err) {
      showLoadError(err);
      initToggle();
      return;
    }

    const wanted = [
      $('#project-detail') ? ['projects', 'projects.json'] : null,
      $('#talks-list') ? ['talks', 'talks.json'] : null,
    ].filter(Boolean);

    const results = await Promise.allSettled(wanted.map(([, file]) => loadJSON(file)));
    results.forEach((result, n) => {
      const [key, file] = wanted[n];
      if (result.status === 'fulfilled') data[key] = result.value;
      else console.error(`${file} failed to load:`, result.reason);
    });

    renderAll();
    revealLoadedImages();
    initToggle();
    initLightbox();
    if (results.some((r) => r.status === 'rejected')) showLoadError();
})();
})();
