/* The site editor.

   The pages read their words from i18n.json, projects.json and connect.json
   at load time, so changing the site's text means changing those three files
   and nothing else: no rebuild. This page reads them from GitHub, lets them
   be edited, and writes them back as one commit with the owner's own key.

   The key is a fine-grained GitHub token limited to this one repository. It
   never leaves the browser except to go to api.github.com. Without it this
   page can show nothing and save nothing, which is what makes it private.

   Edits survive a closed tab: a draft is kept in this browser until it is
   published or discarded. If the files changed on GitHub in the meantime
   (another device, or a publish from the Mac), the draft is replayed onto
   the new version edit by edit, and any edit whose text was changed in both
   places is reported rather than silently overwriting either. */
(() => {
  'use strict';

  const REPO = 'kaixinbuilds/kaixinbuilds.github.io';
  const BRANCH = 'main';
  const API = 'https://api.github.com';
  const SITE = 'https://kaixinbuilds.github.io/';
  const FILES = ['i18n.json', 'projects.json', 'connect.json'];
  const TAB_OF = { 'i18n.json': 'text', 'projects.json': 'projects', 'connect.json': 'connect' };
  const FILE_LABEL = { 'i18n.json': 'Page text', 'projects.json': 'Work', 'connect.json': 'Connect' };
  const TOKEN_KEY = 'kb-admin-token';
  const DRAFT_KEY = 'kb-admin-draft';

  const state = {
    token: '',
    head: '',          // commit the base was read from
    base: {},          // file -> { sha, text, data } as on GitHub
    cur: {},           // file -> data as edited
    sections: [],      // page text grouped by page, in reading order
  };

  /* ── small helpers ─────────────────────────────────────── */

  const $ = (sel, root = document) => root.querySelector(sel);
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const ser = (data) => JSON.stringify(data, null, 2) + '\n';   // matches json.dumps(indent=2, ensure_ascii=False)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isBi = (v) => isObj(v) && ('en' in v || 'zh' in v) && Object.keys(v).every((k) => k === 'en' || k === 'zh');

  function el(tag, attrs = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k in node && typeof v !== 'string') node[k] = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const store = {
    get(key) {
      for (const s of [() => sessionStorage, () => localStorage]) {
        try { const v = s().getItem(key); if (v) return v; } catch (e) { /* storage blocked */ }
      }
      return '';
    },
    set(key, value, persist) {
      try { (persist ? localStorage : sessionStorage).setItem(key, value); } catch (e) { /* storage blocked */ }
    },
    remove(key) {
      try { sessionStorage.removeItem(key); } catch (e) { /* */ }
      try { localStorage.removeItem(key); } catch (e) { /* */ }
    },
  };

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }

  function isEmpty(v) {
    if (v == null || v === '') return true;
    if (Array.isArray(v)) return v.length === 0;
    if (isBi(v)) return !(v.en || '').trim() && !(v.zh || '').trim();
    return false;
  }

  /* ── GitHub ────────────────────────────────────────────── */

  async function gh(path, opts = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + state.token,
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (opts.body) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(API + path, { ...opts, headers, cache: 'no-store' });
    } catch (e) {
      const err = new Error('Could not reach GitHub. Check the internet connection and try again.');
      err.status = 0;
      throw err;
    }
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* */ }
      const err = new Error(explain(res.status, detail));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  function explain(status, detail) {
    if (status === 401) return 'GitHub did not accept the key. It may have expired or been deleted. Make a new one and sign in again.';
    if (status === 403 || status === 404) {
      return 'The key cannot write to kaixinbuilds.github.io. On GitHub, check it is limited to that repository with Contents set to "Read and write". (' + detail + ')';
    }
    return 'GitHub said: ' + (detail || 'error ' + status);
  }

  function decode(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  async function fetchFile(path, ref) {
    const f = await gh(`/repos/${REPO}/contents/${path}?ref=${ref}`);
    const text = decode(f.content);
    return { sha: f.sha, text, data: JSON.parse(text) };
  }

  async function loadRemote() {
    const ref = await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const head = ref.object.sha;
    const files = await Promise.all(FILES.map((f) => fetchFile(f, head)));
    const base = {};
    FILES.forEach((f, i) => { base[f] = files[i]; });
    return { head, base };
  }

  /* ── diffing and replaying edits ───────────────────────────
     A change is { path, old, new }. Path segments are object keys, array
     indexes, { id } for an entry in a list of things with ids (projects,
     talks), or '#order' for the order of such a list. Keying entries by id
     means an edit still lands on the right talk after someone else adds or
     reorders talks elsewhere. */

  const keyed = (arr) => Array.isArray(arr) && arr.every((x) => isObj(x) && 'id' in x);

  /* The key of each entry: its id, or for an entry whose id is still blank
     or doubled up (a project being added), '@' and its position. */
  function keysOf(arr) {
    const count = new Map();
    arr.forEach((x) => count.set(x.id, (count.get(x.id) || 0) + 1));
    return arr.map((x, i) => (typeof x.id === 'string' && x.id && count.get(x.id) === 1 ? x.id : '@' + i));
  }
  const byKey = (arr, key) => arr[keysOf(arr).indexOf(key)];

  function diff(a, b, path = [], out = []) {
    if (deepEqual(a, b)) return out;
    if (isObj(a) && isObj(b)) {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], [...path, k], out);
    } else if (Array.isArray(a) && Array.isArray(b) && keyed(a) && keyed(b) && (a.length || b.length)) {
      const ka = keysOf(a), kb = keysOf(b);
      for (const id of new Set([...ka, ...kb])) diff(byKey(a, id), byKey(b, id), [...path, { id }], out);
      const expected = [...ka.filter((id) => kb.includes(id)), ...kb.filter((id) => !ka.includes(id))];
      if (!deepEqual(expected, kb)) out.push({ path: [...path, '#order'], old: ka, new: kb });
    } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
      a.forEach((x, i) => diff(x, b[i], [...path, i], out));
    } else {
      out.push({ path, old: clone(a), new: clone(b) });
    }
    return out;
  }

  function getAt(doc, path) {
    let node = doc;
    for (const seg of path) {
      if (node == null) return undefined;
      if (seg === '#order') return Array.isArray(node) ? keysOf(node) : undefined;
      if (isObj(seg)) node = Array.isArray(node) ? byKey(node, seg.id) : undefined;
      else node = node[seg];
    }
    return node;
  }

  function setAt(doc, path, value) {
    const parent = getAt(doc, path.slice(0, -1));
    const seg = path[path.length - 1];
    if (parent == null || typeof parent !== 'object') throw new Error('gone');
    if (seg === '#order') {
      const keys = keysOf(parent);
      const rank = (x) => { const i = value.indexOf(keys[parent.indexOf(x)]); return i < 0 ? Infinity : i; };
      const sorted = [...parent].sort((x, y) => rank(x) - rank(y));
      parent.splice(0, parent.length, ...sorted);
    } else if (isObj(seg)) {
      const i = seg.id.startsWith('@') ? -1 : keysOf(parent).indexOf(seg.id);
      if (value === undefined) { if (i >= 0) parent.splice(i, 1); }
      else if (i < 0) parent.push(clone(value));
      else parent[i] = clone(value);
    } else if (value === undefined) {
      if (Array.isArray(parent)) parent.splice(seg, 1); else delete parent[seg];
    } else {
      parent[seg] = clone(value);
    }
  }

  /* Replay changes onto another version of the file. Only edits whose
     starting text is still what is there get applied; the rest come back as
     conflicts, unless force says to write them anyway. */
  function replay(data, changes, force = false) {
    const doc = clone(data);
    const conflicts = [];
    const ordered = [...changes.filter((c) => c.path[c.path.length - 1] !== '#order'),
                     ...changes.filter((c) => c.path[c.path.length - 1] === '#order')];
    for (const ch of ordered) {
      const now = getAt(doc, ch.path);
      if (deepEqual(now, ch.new)) continue;
      if (!force && !deepEqual(now, ch.old)) { conflicts.push({ ...ch, now }); continue; }
      try { setAt(doc, ch.path, ch.new); } catch (e) { conflicts.push({ ...ch, now }); }
    }
    return { data: doc, conflicts };
  }

  const changesIn = (f) => diff(state.base[f].data, state.cur[f]);

  /* ── field descriptions for projects and talks ───────────── */

  const PROJECT_FIELDS = [
    { k: 'id', t: 'text', label: 'ID', req: true, hint: 'Lowercase letters, numbers and hyphens. It becomes the link to this project, e.g. work.html#vocabsummit.' },
    { k: 'featured', t: 'bool', label: 'Flagship: shown first, with stats, the "How it was built" box and large screenshots. Exactly one project should be the flagship.' },
    { k: 'title', t: 'bi', label: 'Title', req: true },
    { k: 'subtitle', t: 'bi', label: 'Subtitle', hint: 'Optional.' },
    { k: 'summary', t: 'bi', label: 'Summary', req: true, long: true },
    { k: 'highlight', t: 'bi', label: '"How it was built" box', long: true, hint: 'Optional.' },
    { k: 'link', t: 'text', label: 'Link to the project', hint: 'The full address, starting https://' },
    { k: 'displayUrl', t: 'text', label: 'Address as shown on the page', hint: 'Without https://, e.g. for.edu.sg/vocabsummit' },
    { k: 'tags', t: 'tags', label: 'Tags', hint: 'Separated by commas. "live" puts the Live badge on the project.' },
    { k: 'stats', t: 'list', label: 'Stats', noun: 'stat',
      fields: [{ k: 'value', t: 'text', label: 'Number' }, { k: 'label', t: 'bi', label: 'What it counts' }],
      blank: () => ({ value: '', label: { en: '', zh: '' } }) },
    { k: 'screenshots', t: 'list', label: 'Screenshots', noun: 'screenshot',
      fields: [
        { k: 'src', t: 'text', label: 'Image file', req: true, hint: 'e.g. assets/screenshots/my-tool.jpg. New images have to be added to that folder from the Mac first.' },
        { k: 'caption', t: 'bi', label: 'Caption' },
        { k: 'wide', t: 'bool', label: 'Span the full width (flagship only)' },
      ],
      blank: () => ({ src: '', caption: { en: '', zh: '' } }) },
    { k: 'links', t: 'list', label: 'Extra links', noun: 'link',
      fields: [{ k: 'label', t: 'bi', label: 'Link text' }, { k: 'url', t: 'text', label: 'Address', req: true }],
      blank: () => ({ label: { en: '', zh: '' }, url: '' }) },
  ];

  const CONNECT_FIELDS = [
    { k: 'id', t: 'text', label: 'ID', req: true, hint: 'Lowercase letters, numbers and hyphens, e.g. nlc-2026. Slides for this talk go in assets/slides/ under the same name.' },
    { k: 'status', t: 'select', label: 'Status', req: true, options: [['upcoming', 'Upcoming'], ['completed', 'Completed']],
      hint: 'Change to Completed once the talk has happened. Nothing does this automatically.' },
    { k: 'category', t: 'select', label: 'Group on the Connect page', options: [['vocabsummit', 'VocabSummit'], ['hub', 'Resource Hub'], ['lesson', 'Lessons'], ['', 'Other']] },
    { k: 'date', t: 'date', label: 'Date', req: true, hint: 'Sets the order within each group.' },
    { k: 'dateLabel', t: 'bi', label: 'Date as shown', hint: 'e.g. 28 August 2026 / 2026年8月28日' },
    { k: 'title', t: 'bi', label: 'Title', req: true, hint: 'Talk titles keep their dash: — in English, —— in Chinese.' },
    { k: 'venue', t: 'bi', label: 'Where, and for whom', long: true },
    { k: 'venueUrl', t: 'text', label: 'Link on the venue line', hint: 'Optional.' },
    { k: 'summary', t: 'bi', label: 'Summary', long: true },
    { k: 'award', t: 'bi', label: 'Award or recognition', hint: 'Optional. Shown as its own ochre line.' },
    { k: 'link', t: 'text', label: 'Write-up link', hint: 'Optional. Shown as "View" with an arrow.' },
    { k: 'links', t: 'list', label: 'Other links', noun: 'link',
      fields: [{ k: 'label', t: 'bi', label: 'Link text' }, { k: 'url', t: 'text', label: 'Address', req: true }],
      blank: () => ({ label: { en: '', zh: '' }, url: '' }) },
  ];

  const LIST = {
    'projects.json': {
      fields: PROJECT_FIELDS, noun: 'project', reorder: true,
      blank: () => ({ id: '', featured: false, title: { en: '', zh: '' }, summary: { en: '', zh: '' }, tags: [] }),
      intro: 'Projects on the Work page. The flagship always shows first; the rest follow in this order.',
    },
    'connect.json': {
      fields: CONNECT_FIELDS, noun: 'talk or post', reorder: false,
      blank: () => ({ id: '', status: 'upcoming', category: 'vocabsummit', date: '', dateLabel: { en: '', zh: '' },
                      title: { en: '', zh: '' }, venue: { en: '', zh: '' }, summary: { en: '', zh: '' } }),
      intro: 'Talks, workshops and write-ups. The Connect page groups them and sorts each group by date, so the order here does not matter.',
    },
  };

  const LABELS = { en: 'English', zh: '中文', '#order': 'Order' };
  for (const spec of [PROJECT_FIELDS, CONNECT_FIELDS]) {
    for (const f of spec) {
      LABELS[f.k] = LABELS[f.k] || f.label.split(':')[0];
      for (const g of f.fields || []) LABELS[g.k] = LABELS[g.k] || g.label;
    }
  }

  /* ── where a change is, in words ─────────────────────────── */

  function sectionOfKey(key) {
    const s = state.sections.find((x) => x.keys.includes(key));
    return s ? s.name : 'Page text';
  }

  function whereIs(file, path) {
    const parts = [FILE_LABEL[file]];
    if (file === 'i18n.json') {
      parts[0] = sectionOfKey(path[0]);
      parts.push(path[0]);
      path.slice(1).forEach((s) => parts.push(LABELS[s] || s));
      return parts.join(' › ');
    }
    path.forEach((seg, i) => {
      if (isObj(seg)) {
        const item = getAt(state.cur[file], path.slice(0, i + 1)) || getAt(state.base[file].data, path.slice(0, i + 1));
        parts.push(item && item.title && (item.title.en || item.title.zh) ? (item.title.en || item.title.zh)
          : seg.id.startsWith('@') ? 'New entry' : seg.id);
      } else if (typeof seg === 'number') {
        parts.push('#' + (seg + 1));
      } else {
        parts.push(LABELS[seg] || seg);
      }
    });
    return parts.join(' › ');
  }

  function show(v, file, order) {
    if (v === undefined) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (isBi(v)) return `${v.en || ''}\n${v.zh || ''}`.trim();
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && !order) return v.join(', ');
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      // an order change is a list of ids; show titles instead where we can
      const name = (id) => {
        const item = Array.isArray(state.cur[file]) ? byKey(state.cur[file], id) : null;
        if (id.startsWith('@')) return 'New entry';
        return item && item.title ? (item.title.en || id) : id;
      };
      return v.map(Array.isArray(state.cur[file]) ? name : (x) => x).join(file === 'i18n.json' ? ', ' : '\n');
    }
    if (isObj(v) && 'id' in v) return 'New: ' + ((v.title && (v.title.en || v.title.zh)) || v.id || '(untitled)');
    // a list of stats, screenshots or links: one line each, the words only
    const line = (x) => { const parts = []; stringsIn(x, [], (p, s) => { if (s.trim()) parts.push(s.trim()); }); return parts.join(' · ') || '(blank)'; };
    if (Array.isArray(v)) return v.map((x) => '• ' + line(x)).join('\n');
    return line(v);
  }

  /* ── house rules ──────────────────────────────────────────
     Warnings, never blocks: each comes from a rule the site already keeps,
     and there will be the odd deliberate exception. */

  const CJK = /[㐀-鿿豈-﫿　-〿！-｠]/;

  function stringsIn(value, path, cb) {
    if (typeof value === 'string') cb(path, value);
    else if (Array.isArray(value)) value.forEach((x, i) => stringsIn(x, [...path, i], cb));
    else if (isObj(value)) Object.entries(value).forEach(([k, x]) => stringsIn(x, [...path, k], cb));
  }

  function warningsFor(file, ch) {
    const out = [];
    stringsIn(ch.new, ch.path, (path, s) => {
      const lang = path[path.length - 1];
      const isTitle = path.some((p) => typeof p === 'string' && /title|eyebrow/i.test(p));
      if (/^(id|src|url|link|venueUrl|displayUrl|date|tags|value)$/.test(String(lang)) || typeof lang === 'number') {
        if (/^(url|link|venueUrl)$/.test(String(lang)) && s && /\s/.test(s.trim())) out.push('This address has a space in it.');
        return;
      }
      if (lang === 'en' && CJK.test(s)) out.push('Chinese characters in the English text. English readers cannot read them: romanise or translate.');
      if (s.includes('—') && !isTitle) out.push('Em dash in body text. On this site they belong only in talk and workshop titles.');
      if (lang === 'zh' && isTitle && /(^|[^—])—(?!—)/.test(s)) out.push('A single — in a Chinese title. Chinese titles use ——.');
      if (/kai ?xin chun/i.test(s)) out.push('Name order: it is Chun Kai Xin, surname first.');
      if (s.includes('春凯欣')) out.push('The surname is 郑: 郑凯欣.');
      if (/[<>]/.test(s)) out.push('< or > is read as HTML on the page and may not show as typed.');
      if (s !== s.trim()) out.push('Starts or ends with a space or a blank line.');
    });
    // one language filled, the other left empty
    const last = ch.path[ch.path.length - 1];
    if (last === 'en' || last === 'zh') {
      const pair = getAt(state.cur[file], ch.path.slice(0, -1));
      if (isBi(pair) && !!(pair.en || '').trim() !== !!(pair.zh || '').trim()) out.push('Only one language is filled in, so the other language will show a blank.');
    }
    return [...new Set(out)];
  }

  /* Problems that would break a page. Only problems that are new compared
     with what is on GitHub block publishing, so an existing oddity can never
     stop an unrelated edit going out. */
  function problemsIn(file, data) {
    const out = [];
    if (file === 'i18n.json') return out;
    const ids = new Map();
    data.forEach((x) => {
      const name = (x.title && (x.title.en || x.title.zh)) || x.id || 'An entry';
      if (!x.id) out.push(`${name}: needs an ID.`);
      else if (!/^[a-z0-9][a-z0-9-]*$/.test(x.id)) out.push(`${name}: the ID "${x.id}" may only use lowercase letters, numbers and hyphens.`);
      ids.set(x.id, (ids.get(x.id) || 0) + 1);
      if (!x.title || !(x.title.en || '').trim()) out.push(`${name}: needs an English title.`);
      if (file === 'connect.json') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date || '')) out.push(`${name}: needs a date.`);
        if (!['upcoming', 'completed'].includes(x.status)) out.push(`${name}: status must be Upcoming or Completed.`);
      }
      for (const s of x.screenshots || []) if (!s.src) out.push(`${name}: a screenshot has no image file.`);
      for (const s of x.stats || []) if (!String(s.value || '').trim()) out.push(`${name}: a stat has no number.`);
      for (const l of x.links || []) if (!l.url) out.push(`${name}: a link has no address.`);
    });
    for (const [id, n] of ids) if (id && n > 1) out.push(`Two entries share the ID "${id}". Each needs its own.`);
    if (file === 'projects.json') {
      const n = data.filter((x) => x.featured).length;
      if (n !== 1) out.push(`Exactly one project should be the flagship; ${n} are.`);
    }
    return out;
  }

  /* ── page text: grouped by the page it is on ─────────────── */

  async function buildSections() {
    const keys = Object.keys(state.cur['i18n.json']).filter((k) => isBi(state.cur['i18n.json'][k]));
    let pages = [];
    try {
      const xml = await (await fetch(SITE + 'sitemap.xml', { cache: 'no-store' })).text();
      const files = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, '') || 'index.html');
      pages = await Promise.all(files.map(async (file) => {
        const html = await (await fetch(SITE + file, { cache: 'no-store' })).text();
        const title = ((html.match(/<title[^>]*>([^<]*)<\/title>/) || [])[1] || file).split(' - ')[0];
        const found = [...html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map((m) => m[1]);
        return { file, name: file === 'index.html' ? 'Home' : title, keys: [...new Set(found)] };
      }));
    } catch (e) {
      pages = [];
    }

    const onPages = new Map();
    pages.forEach((p) => p.keys.forEach((k) => onPages.set(k, (onPages.get(k) || 0) + 1)));
    const placed = new Set();
    const sections = [];
    const shared = keys.filter((k) => (onPages.get(k) || 0) >= 3);
    if (shared.length) {
      sections.push({ name: 'Every page', meta: 'header, menu and footer', keys: shared });
      shared.forEach((k) => placed.add(k));
    }
    for (const p of pages) {
      const mine = p.keys.filter((k) => keys.includes(k) && !placed.has(k));
      mine.forEach((k) => placed.add(k));
      if (mine.length) sections.push({ name: p.name, meta: p.file, file: p.file, keys: mine });
    }
    const rest = keys.filter((k) => !placed.has(k));
    if (rest.length) {
      sections.push({
        name: pages.length ? 'Labels inside projects, talks and pop-ups' : 'All page text',
        meta: pages.length ? 'buttons, badges and headings the site fills in itself' : '',
        keys: rest,
      });
    }
    state.sections = sections;
  }

  function grow(t) {
    if (!t.offsetParent) return;   // inside something closed: sized when it opens
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  }

  function textarea(value, lang, onInput, long) {
    const t = el('textarea', {
      rows: long ? 3 : 1, lang: lang === 'zh' ? 'zh-Hans' : 'en', spellcheck: lang === 'en' ? 'true' : 'false',
      oninput: (e) => { grow(e.target); onInput(e.target.value); },
    });
    t.value = value || '';
    requestAnimationFrame(() => grow(t));
    return t;
  }

  /* Titles and the description also exist as a fixed copy written into each
     page by build.py, which is what Google and link previews read. Editing
     them here changes what visitors see, but not those. */
  function hintFor(key) {
    let text = '';
    if (/^page\..+\.title$/.test(key)) text = 'Browser tab title.';
    else if (key === 'site.description') text = 'Page description.';
    if (!text) return null;
    return el('span', { class: 'hint-inline', title: 'Search results and link previews read a fixed copy in build.py. Change that one from the Mac.' },
      text + ' Google keeps its own copy (in build.py).');
  }

  function renderText() {
    const host = $('#tab-text');
    const dict = state.cur['i18n.json'];
    const base = state.base['i18n.json'].data;
    host.replaceChildren();

    const search = el('input', { type: 'search', placeholder: 'Find text, in English or Chinese…', 'aria-label': 'Find text' });
    const onlyChanged = el('input', { type: 'checkbox' });
    host.append(
      el('p', { class: 'intro' }, 'Every sentence on the site, page by page, in reading order. Edit either language; changes are kept on this device until you publish.'),
      el('div', { class: 'toolbar' }, search, el('label', {}, onlyChanged, ' Only what I changed')),
    );

    const entries = [];
    for (const sec of state.sections) {
      const badge = el('span', { class: 'badge', hidden: true });
      const body = el('div', { class: 'section-body' });
      const box = el('details', { class: 'section' },
        el('summary', {}, sec.name, sec.meta ? el('span', { class: 'meta' }, sec.meta) : null, badge,
          sec.file ? el('a', { class: 'meta', href: SITE + sec.file, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, 'open page ↗') : null),
        body);
      sec.badge = badge;
      sec.box = box;
      for (const key of sec.keys) {
        const undo = el('button', { type: 'button', class: 'link undo', hidden: true, text: 'Undo' });
        const row = el('div', { class: 'entry', 'data-key': key });
        const mark = () => {
          const changed = !deepEqual(dict[key], base[key]);
          row.classList.toggle('changed', changed);
          undo.hidden = !changed;
        };
        const fields = ['en', 'zh'].map((lang) => {
          const t = textarea(dict[key][lang], lang, (v) => { dict[key][lang] = v; mark(); edited(); },
            (base[key][lang] || '').length > 90);
          return el('label', { class: 'lang' }, el('span', {}, LABELS[lang]), t);
        });
        undo.addEventListener('click', () => {
          dict[key] = clone(base[key]);
          fields.forEach((f, i) => { const t = $('textarea', f); t.value = dict[key][['en', 'zh'][i]] || ''; grow(t); });
          mark(); edited();
        });
        row.append(el('div', { class: 'entry-head' }, el('code', {}, key), hintFor(key), undo), el('div', { class: 'pair' }, fields));
        mark();
        body.append(row);
        entries.push({ row, key, sec });
      }
      host.append(box);
    }

    const filter = () => {
      const q = search.value.trim().toLowerCase();
      const only = onlyChanged.checked;
      const hits = new Map();
      for (const { row, key, sec } of entries) {
        const v = dict[key];
        const match = (!q || [key, v.en, v.zh].some((s) => (s || '').toLowerCase().includes(q))) &&
          (!only || !deepEqual(v, base[key]));
        row.hidden = !match;
        if (match) hits.set(sec, (hits.get(sec) || 0) + 1);
      }
      for (const sec of state.sections) {
        sec.box.hidden = !hits.get(sec);
        if (q || only) sec.box.open = !!hits.get(sec);
      }
    };
    search.addEventListener('input', filter);
    onlyChanged.addEventListener('change', filter);
  }

  /* ── projects and talks ──────────────────────────────────── */

  /* Write one field. Clearing an optional field removes it from the file
     rather than leaving an empty value the page would render as a blank. */
  function put(obj, f, value, baseObj) {
    const had = baseObj && f.k in baseObj;
    if (f.t === 'bool') {
      if (value) obj[f.k] = true;
      else if (had) obj[f.k] = false;
      else delete obj[f.k];
    } else if (!isEmpty(value)) {
      obj[f.k] = value;
    } else if (had && isEmpty(baseObj[f.k])) {
      obj[f.k] = clone(baseObj[f.k]);
    } else if (f.req) {
      obj[f.k] = value;
    } else {
      delete obj[f.k];
    }
  }

  function renderField(obj, f, getBase, onChange) {
    const box = el('div', { class: 'field' + (f.t === 'bool' ? ' check' : '') });
    const mark = () => {
      const b = getBase();
      box.classList.toggle('changed', !deepEqual(obj[f.k], b ? b[f.k] : undefined));
    };
    const changed = () => { mark(); onChange(); };
    const head = [el('span', { class: 'label' }, f.label), f.hint ? el('span', { class: 'hint' }, f.hint) : null].filter(Boolean);

    if (f.t === 'bool') {
      const c = el('input', { type: 'checkbox', checked: !!obj[f.k], onchange: (e) => { put(obj, f, e.target.checked, getBase()); changed(); } });
      box.append(el('label', {}, c, el('span', {}, f.label)));
    } else if (f.t === 'bi') {
      const pair = ['en', 'zh'].map((lang) => el('label', { class: 'lang' }, el('span', {}, LABELS[lang]),
        textarea(obj[f.k] && obj[f.k][lang], lang, (v) => {
          const next = { en: '', zh: '', ...(obj[f.k] || {}) };
          next[lang] = v;
          put(obj, f, next, getBase());
          changed();
        }, f.long)));
      box.append(...head, el('div', { class: 'pair' }, pair));
    } else if (f.t === 'select') {
      const s = el('select', { onchange: (e) => { put(obj, f, e.target.value, getBase()); changed(); } },
        f.options.map(([v, label]) => el('option', { value: v }, label)));
      const known = f.options.some(([v]) => v === (obj[f.k] || ''));
      if (!known) s.append(el('option', { value: obj[f.k] }, obj[f.k]));
      s.value = obj[f.k] || '';
      box.append(...head, s);
    } else if (f.t === 'tags') {
      const i = el('input', { type: 'text', value: (obj[f.k] || []).join(', '),
        oninput: (e) => { put(obj, f, e.target.value.split(',').map((x) => x.trim()).filter(Boolean), getBase()); changed(); } });
      box.append(...head, i);
    } else if (f.t === 'list') {
      const list = el('div', { class: 'sublist' });
      const draw = () => {
        const items = obj[f.k] || [];
        list.replaceChildren(...items.map((item, idx) => {
          const sub = el('div', { class: 'subitem' });
          for (const g of f.fields) {
            sub.append(renderField(item, g, () => { const b = getBase(); return b && b[f.k] ? b[f.k][idx] : undefined; }, changed));
          }
          const move = (d) => {
            const j = idx + d;
            if (j < 0 || j >= items.length) return;
            [items[idx], items[j]] = [items[j], items[idx]];
            draw(); changed();
          };
          sub.append(el('div', { class: 'subitem-actions' },
            el('button', { type: 'button', class: 'btn btn-small', disabled: idx === 0, onclick: () => move(-1), 'aria-label': 'Move up' }, '↑'),
            el('button', { type: 'button', class: 'btn btn-small', disabled: idx === items.length - 1, onclick: () => move(1), 'aria-label': 'Move down' }, '↓'),
            el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
              items.splice(idx, 1);
              put(obj, f, items, getBase());
              draw(); changed();
            } }, 'Remove ' + f.noun)));
          return sub;
        }));
      };
      draw();
      const add = el('button', { type: 'button', class: 'btn btn-small add-row', onclick: () => {
        obj[f.k] = [...(obj[f.k] || []), f.blank()];
        draw(); changed();
      } }, '+ Add ' + f.noun);
      box.append(...head, list, add);
    } else {
      const i = el('input', { type: f.t === 'date' ? 'date' : 'text', value: obj[f.k] || '', spellcheck: 'false',
        oninput: (e) => { put(obj, f, e.target.value.trim(), getBase()); changed(); } });
      box.append(...head, i);
    }
    mark();
    return box;
  }

  /* Anything in the file this page has no form for (the unused "embed", or a
     field added later) is still editable, as raw JSON, rather than hidden. */
  function renderExtra(obj, k, getBase, onChange) {
    const box = el('div', { class: 'field' });
    const t = textarea(JSON.stringify(obj[k], null, 2), 'en', (v) => {
      try { obj[k] = JSON.parse(v); t.classList.remove('invalid'); }
      catch (e) { t.classList.add('invalid'); return; }
      const b = getBase();
      box.classList.toggle('changed', !deepEqual(obj[k], b ? b[k] : undefined));
      onChange();
    }, true);
    t.style.fontFamily = 'var(--mono)';
    box.append(el('span', { class: 'label' }, k), el('span', { class: 'hint' }, 'No form for this one, so it is shown as written in the file. Edit carefully.'), t);
    return box;
  }

  function renderList(file) {
    const host = $('#tab-' + TAB_OF[file]);
    const spec = LIST[file];
    const data = state.cur[file];
    host.replaceChildren(el('p', { class: 'intro' }, spec.intro));

    // the entry each card started from, so a renamed ID still compares right
    const origin = new WeakMap();
    const baseList = state.base[file].data;
    data.forEach((item) => origin.set(item, baseList.find((b) => b.id === item.id)));

    const list = el('div');
    const draw = (openItem) => {
      list.replaceChildren(...data.map((item, idx) => {
        const getBase = () => origin.get(item);
        const title = el('b');
        const meta = el('span', { class: 'meta' });
        const badge = el('span', { class: 'badge', hidden: true }, 'edited');
        const head = () => {
          title.textContent = (item.title && (item.title.en || item.title.zh)) || 'Untitled ' + spec.noun;
          meta.textContent = [item.title && item.title.zh, file === 'connect.json' ? item.date : null,
            item.featured ? 'flagship' : null, item.status === 'upcoming' ? 'upcoming' : null].filter(Boolean).join(' · ');
          badge.hidden = deepEqual(item, getBase());
          if (!getBase()) badge.textContent = 'new';
        };
        const onChange = () => { head(); edited(); };
        const body = el('div', { class: 'item-body' });
        for (const f of spec.fields) body.append(renderField(item, f, getBase, onChange));
        for (const k of Object.keys(item)) {
          if (!spec.fields.some((f) => f.k === k)) body.append(renderExtra(item, k, getBase, onChange));
        }
        const move = (d) => {
          const j = idx + d;
          if (j < 0 || j >= data.length) return;
          [data[idx], data[j]] = [data[j], data[idx]];
          draw(); edited();
        };
        body.append(el('div', { class: 'item-actions' },
          spec.reorder ? el('button', { type: 'button', class: 'btn btn-small', disabled: idx === 0, onclick: () => move(-1) }, '↑ Move up') : null,
          spec.reorder ? el('button', { type: 'button', class: 'btn btn-small', disabled: idx === data.length - 1, onclick: () => move(1) }, '↓ Move down') : null,
          getBase() ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
            const b = clone(getBase());
            data[idx] = b;
            origin.set(b, getBase());
            draw(b); edited();
          } }, 'Undo changes to this one') : null,
          el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
            if (!confirm(`Remove "${title.textContent}" from the site? You can still discard this before publishing.`)) return;
            data.splice(idx, 1);
            draw(); edited();
          } }, 'Remove'),
        ));
        head();
        return el('details', { class: 'item', open: item === openItem }, el('summary', {}, title, meta, badge), body);
      }));
    };
    draw();
    host.append(list, el('p', {}, el('button', { type: 'button', class: 'btn', onclick: () => {
      const item = spec.blank();
      data.push(item);
      draw(item); edited();
      const last = list.lastElementChild;
      last.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('input', last).focus();
    } }, '+ Add a ' + spec.noun)));
  }

  /* ── change tracking, drafts, the bar ────────────────────── */

  let draftTimer = 0;
  function edited() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { saveDraft(); refreshBar(); }, 200);
  }

  function saveDraft() {
    const any = FILES.some((f) => changesIn(f).length);
    if (!any) { store.remove(DRAFT_KEY); return; }
    const base = {};
    FILES.forEach((f) => { base[f] = { sha: state.base[f].sha, text: state.base[f].text }; });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ base, cur: state.cur })); } catch (e) { /* storage full or blocked */ }
  }

  function restoreDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
    if (!draft || !draft.base || !draft.cur) return;
    let restored = 0;
    const lost = [];
    for (const f of FILES) {
      if (!draft.base[f] || !draft.cur[f]) continue;
      const changes = diff(JSON.parse(draft.base[f].text), draft.cur[f]);
      if (!changes.length) continue;
      if (draft.base[f].sha === state.base[f].sha) {
        state.cur[f] = draft.cur[f];
        restored += changes.length;
      } else {
        const r = replay(state.base[f].data, changes);
        state.cur[f] = r.data;
        restored += changes.length - r.conflicts.length;
        r.conflicts.forEach((c) => lost.push({ file: f, ...c }));
      }
    }
    if (restored) notice(`Picked up ${restored} unpublished edit${restored > 1 ? 's' : ''} from last time. They are marked in ochre.`);
    if (lost.length) {
      notice(el('div', {},
        'Some unpublished edits from last time could not be restored, because the same text was changed elsewhere since. Here is what you had typed, so you can redo them if you still want them:',
        el('ul', {}, lost.map((c) => el('li', {}, el('b', {}, whereIs(c.file, c.path) + ': '), show(c.new, c.file) || '(removed)')))), 'bad');
    }
  }

  function refreshBar() {
    let total = 0;
    for (const f of FILES) {
      const n = changesIn(f).length;
      total += n;
      const badge = $(`.tabs [data-tab="${TAB_OF[f]}"] .n`);
      badge.hidden = !n;
      badge.textContent = n;
    }
    if (state.sections.length) {
      const dict = state.cur['i18n.json'], base = state.base['i18n.json'].data;
      for (const sec of state.sections) {
        const n = sec.keys.filter((k) => !deepEqual(dict[k], base[k])).length;
        sec.badge.hidden = !n;
        sec.badge.textContent = n + ' edited';
      }
    }
    $('#count').textContent = total ? `${total} change${total > 1 ? 's' : ''}, not yet on the site` : 'No changes yet';
    $('#review').disabled = !total;
    $('#discard').hidden = !total;
  }

  function notice(content, kind = '') {
    const close = el('button', { type: 'button', class: 'link', style: 'float:right', onclick: () => box.remove() }, 'Dismiss');
    const box = el('div', { class: 'notice ' + kind }, close, content);
    $('#notices').append(box);
    return box;
  }

  function renderAll() {
    renderText();
    renderList('projects.json');
    renderList('connect.json');
    refreshBar();
  }

  /* ── review and publish ──────────────────────────────────── */

  const dialog = $('#dialog');

  function openReview() {
    const body = $('#dlg-body');
    const foot = $('#dlg-foot');
    $('#dlg-title').textContent = 'Review your changes';
    body.replaceChildren();
    foot.replaceChildren();
    $('#dlg-close').hidden = false;

    let problems = [];
    let total = 0;
    const summary = [];
    for (const f of FILES) {
      const changes = changesIn(f);
      if (!changes.length) continue;
      total += changes.length;
      const before = new Set(problemsIn(f, state.base[f].data));
      const now = problemsIn(f, state.cur[f]).filter((p) => !before.has(p));
      problems = problems.concat(now.map((p) => FILE_LABEL[f] + ': ' + p));
      body.append(el('h3', { style: 'margin-top:16px' }, FILE_LABEL[f]));
      for (const ch of changes) {
        const where = whereIs(f, ch.path);
        summary.push(f === 'i18n.json' ? ch.path[0] : where.split(' › ').slice(1, 2).join(''));
        const order = ch.path[ch.path.length - 1] === '#order';
        const oldText = show(ch.old, f, order), newText = show(ch.new, f, order);
        body.append(el('div', { class: 'change' },
          el('div', { class: 'where' }, where),
          el('div', { class: 'old' + (oldText == null ? ' none' : '') }, oldText == null ? 'Not there before' : oldText || '(empty)'),
          el('div', { class: 'new' + (newText == null ? ' none' : '') }, newText == null ? 'Removed' : newText || '(empty)'),
          warningsFor(f, ch).map((w) => el('div', { class: 'warn' }, w))));
      }
    }
    if (problems.length) {
      body.prepend(el('div', { class: 'notice bad' }, el('b', {}, 'Fix these first, or the page would break:'),
        el('ul', {}, problems.map((p) => el('li', { class: 'problem' }, p)))));
    }

    const names = [...new Set(summary.filter(Boolean))];
    const msg = el('input', { type: 'text', 'aria-label': 'Note for the history',
      placeholder: 'Edit ' + (names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')) });
    foot.append(
      el('label', {}, el('span', { style: 'font-size:14px;color:var(--ink-soft)' }, 'A note for the site history (optional)'), msg),
      el('div', { class: 'buttons' },
        el('button', { type: 'button', class: 'btn', onclick: () => dialog.close() }, 'Keep editing'),
        el('button', { type: 'button', class: 'btn btn-ochre', disabled: !!problems.length,
          onclick: () => runPublish(msg.value.trim() || msg.placeholder) },
          `Publish ${total} change${total > 1 ? 's' : ''}`)));
    dialog.showModal();
  }

  function steps(labels) {
    const items = labels.map((l) => el('li', {}, l));
    const ul = el('ul', { class: 'progress' }, items);
    const set = (i, cls, text) => { items[i].className = cls; if (text) items[i].textContent = text; };
    return { ul, set };
  }

  async function runPublish(message, force = false) {
    const body = $('#dlg-body');
    const foot = $('#dlg-foot');
    $('#dlg-title').textContent = 'Publishing';
    $('#dlg-close').hidden = true;
    const p = steps(['Saving to GitHub', 'Waiting for the live site to update (usually under two minutes)']);
    body.replaceChildren(p.ul);
    foot.replaceChildren();
    p.set(0, 'busy');

    let result;
    try {
      result = await commit(message + '\n\nEdited in the kaixinbuilds editor.', force);
    } catch (e) {
      p.set(0, 'fail');
      $('#dlg-close').hidden = false;
      if (e.conflicts) {
        $('#dlg-title').textContent = 'Changed in two places';
        body.append(el('p', {}, 'Since you opened the editor, some of the same text was also changed somewhere else (another device, or from the Mac). Nothing has been published yet.'),
          el('div', {}, e.conflicts.map((c) => el('div', { class: 'change' },
            el('div', { class: 'where' }, whereIs(c.file, c.path)),
            el('div', { class: 'old' }, 'Now on the site: ' + (show(c.now, c.file) ?? '(removed)')),
            el('div', { class: 'new' }, 'Yours: ' + (show(c.new, c.file) ?? '(removed)'))))));
        foot.append(el('div', { class: 'buttons' },
          el('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Reload and look again'),
          el('button', { type: 'button', class: 'btn btn-ochre', onclick: () => runPublish(message, true) }, 'Use mine and publish')));
        return;
      }
      body.append(el('div', { class: 'notice bad' }, e.message, el('p', {}, 'Nothing was published. Your edits are still here.')));
      return;
    }

    p.set(0, 'done', 'Saved to GitHub');
    p.set(1, 'busy');
    // the files are on GitHub now, so this is the new starting point
    state.head = result.sha;
    for (const f of Object.keys(result.written)) {
      const text = ser(result.written[f]);
      state.base[f] = { sha: result.blobs[f], text, data: JSON.parse(text) };
      state.cur[f] = JSON.parse(text);
    }
    store.remove(DRAFT_KEY);
    renderAll();

    const live = await waitForLive(result.written);
    $('#dlg-close').hidden = false;
    if (live) {
      $('#dlg-title').textContent = 'Published';
      p.set(1, 'done', 'Live on kaixinbuilds.github.io');
      foot.append(el('div', { class: 'buttons' },
        el('a', { class: 'btn', href: SITE, target: '_blank', rel: 'noopener' }, 'See the site ↗'),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close() }, 'Done')));
    } else {
      $('#dlg-title').textContent = 'Saved, but not live yet';
      p.set(1, 'fail', 'The live site has not picked it up after six minutes');
      body.append(el('div', { class: 'notice' },
        'The edits are safely on GitHub. A deploy occasionally takes longer, and occasionally fails without telling anyone. Check ',
        el('a', { href: `https://github.com/${REPO}/deployments`, target: '_blank', rel: 'noopener' }, 'the deployments page'),
        ' in a few minutes. If the latest one failed, a second publish of anything usually clears it.'));
      foot.append(el('div', { class: 'buttons' }, el('button', { type: 'button', class: 'btn btn-primary', onclick: () => dialog.close() }, 'Close')));
    }
  }

  /* One commit for everything, through the Git data API: tree, commit, then
     move the branch. The branch move is not forced, so if anything else was
     pushed in between it fails and the whole thing is redone on top of it. */
  async function commit(message, force) {
    const changed = FILES.filter((f) => changesIn(f).length);
    const changes = Object.fromEntries(changed.map((f) => [f, changesIn(f)]));
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = (await gh(`/repos/${REPO}/git/ref/heads/${BRANCH}`)).object.sha;
      const tree = (await gh(`/repos/${REPO}/git/commits/${head}`)).tree.sha;
      const written = {};
      const conflicts = [];
      for (const f of changed) {
        if (head === state.head) { written[f] = state.cur[f]; continue; }
        const remote = await fetchFile(f, head);
        if (remote.sha === state.base[f].sha) { written[f] = state.cur[f]; continue; }
        const r = replay(remote.data, changes[f], force);
        written[f] = r.data;
        r.conflicts.forEach((c) => conflicts.push({ file: f, ...c }));
      }
      if (conflicts.length) { const e = new Error('conflict'); e.conflicts = conflicts; throw e; }

      const newTree = await gh(`/repos/${REPO}/git/trees`, { method: 'POST', body: JSON.stringify({
        base_tree: tree,
        tree: changed.map((f) => ({ path: f, mode: '100644', type: 'blob', content: ser(written[f]) })),
      }) });
      const made = await gh(`/repos/${REPO}/git/commits`, { method: 'POST', body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }) });
      try {
        await gh(`/repos/${REPO}/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: made.sha, force: false }) });
      } catch (e) {
        if (e.status === 422 && attempt < 2) continue;   // someone pushed in between: go again on top of it
        throw e;
      }
      const blobs = {};
      for (const entry of newTree.tree) if (changed.includes(entry.path)) blobs[entry.path] = entry.sha;
      return { sha: made.sha, written, blobs };
    }
    throw new Error('GitHub kept moving underneath the save. Wait a minute and publish again.');
  }

  /* A push is not a deploy: Pages can fail to build and tell nobody (see
     README, "Publishing"). So ask the live site itself. */
  async function waitForLive(written) {
    const until = Date.now() + 6 * 60 * 1000;
    while (Date.now() < until) {
      await sleep(10000);
      let all = true;
      for (const [f, data] of Object.entries(written)) {
        try {
          const live = await (await fetch(`${SITE}${f}?v=${Date.now()}`, { cache: 'no-store' })).json();
          if (!deepEqual(live, data)) { all = false; break; }
        } catch (e) { all = false; break; }
      }
      if (all) return true;
    }
    return false;
  }

  /* ── start ──────────────────────────────────────────────── */

  function showSignin(message) {
    $('#app').hidden = true;
    $('#signin').hidden = false;
    const err = $('#signin-error');
    err.hidden = !message;
    err.textContent = message || '';
    $('#token-input').focus();
  }

  async function start() {
    $('#signin').hidden = true;
    $('#app').hidden = false;
    $('#loading').hidden = false;
    try {
      const { head, base } = await loadRemote();
      state.head = head;
      state.base = base;
      state.cur = Object.fromEntries(FILES.map((f) => [f, clone(base[f].data)]));
    } catch (e) {
      if (e.status === 401) { store.remove(TOKEN_KEY); showSignin(e.message); return; }
      $('#loading').textContent = e.message;
      return;
    }
    await buildSections();
    restoreDraft();
    $('#loading').hidden = true;
    renderAll();
    selectTab(store.get('kb-admin-tab') || 'text');
  }

  function selectTab(name) {
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    for (const t of ['text', 'projects', 'connect']) $('#tab-' + t).hidden = t !== name;
    store.set('kb-admin-tab', name, false);
    requestAnimationFrame(() => $('#tab-' + name).querySelectorAll('details[open] textarea').forEach(grow));
  }

  $('#signin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const token = $('#token-input').value.trim();
    if (!token) return;
    state.token = token;
    store.remove(TOKEN_KEY);
    store.set(TOKEN_KEY, token, $('#remember').checked);
    $('#token-input').value = '';
    start();
  });

  $('#signout').addEventListener('click', () => {
    const pending = FILES.some((f) => state.base[f] && changesIn(f).length);
    if (pending && !confirm('Sign out? Your unpublished edits stay saved on this device for next time.')) return;
    store.remove(TOKEN_KEY);
    state.token = '';
    location.reload();
  });

  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
  $('#review').addEventListener('click', openReview);
  $('#dlg-close').addEventListener('click', () => dialog.close());
  $('#discard').addEventListener('click', () => {
    if (!confirm('Throw away every unpublished edit and go back to what is on the site?')) return;
    state.cur = Object.fromEntries(FILES.map((f) => [f, clone(state.base[f].data)]));
    store.remove(DRAFT_KEY);
    renderAll();
  });
  window.addEventListener('pagehide', () => { if (state.base['i18n.json']) saveDraft(); });
  // textareas inside a closed section cannot be measured, so size them on opening
  document.addEventListener('toggle', (e) => {
    if (e.target.open) e.target.querySelectorAll('textarea').forEach(grow);
  }, true);

  state.token = store.get(TOKEN_KEY);
  if (state.token) start(); else showSignin();
})();
