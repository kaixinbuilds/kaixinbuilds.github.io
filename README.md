# kaixinbuilds.github.io

Personal portfolio for **Chun Kai Xin 郑凯欣**: Chinese Language teacher, HOD/MTL, and independent EdTech builder.

Static HTML, CSS and vanilla JavaScript. No framework, no build step, no dependencies.
Live at **https://kaixinbuilds.github.io**

---

## Running it locally

The page loads its content from JSON files, and browsers block `fetch()` when a page is
opened straight from disk (`file://`). So **don't double-click `index.html`** — serve the
folder over HTTP instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Stop it with `Ctrl-C`.

---

## Editing content — you should never need to touch HTML

| I want to… | Edit this file |
|---|---|
| Add or change a project | `projects.json` |
| Add a talk or community contribution | `talks.json` |
| Change any wording on the page | `i18n.json` |
| Change colours, spacing, typography | `style.css` (the `:root` block at the top) |
| Redraw the lino illustrations | see **Artwork** below |

Every content file is bilingual. Each string is a `{ "en": "…", "zh": "…" }` pair —
fill in both sides and the language toggle handles the rest.

### Adding a project

Append one object to the array in `projects.json`:

```json
{
  "id": "my-new-tool",
  "featured": false,
  "title":   { "en": "My New Tool", "zh": "新工具" },
  "summary": { "en": "One or two sentences.", "zh": "一两句话说明。" },
  "link": "https://kaixinbuilds.github.io/my-new-tool/",
  "tags": ["game", "live"]
}
```

`"featured": true` puts a project in the large hero section (and unlocks the extra
`subtitle`, `stats`, `highlight` and `screenshots` fields). Exactly one project should be
featured at a time. Everything with `"featured": false` renders as a card in the grid.

Omit `"link"` (or leave it `""`) and the card shows "Internal use" instead of a dead link.

### Adding a talk

Append one object to `talks.json`. Set `"status"` to `"upcoming"` or `"completed"` —
the badge and sort order follow from `date` (ISO format, `YYYY-MM-DD`), newest first.
Leave `"link": ""` until slides or photos exist; the link simply won't render.

### Changing wording

Every visible string that isn't project or talk data lives in `i18n.json`, keyed by the
`data-i18n="…"` attributes in `index.html`. Change the value, reload — that's it.

---

## Screenshots

Drop images into `assets/screenshots/` and reference them from `projects.json`.

- **Format:** PNG for UI screenshots, JPEG for photos
- **Width:** around 1400–1600px is plenty; anything larger just slows the page down
- **File size:** keep each under ~400KB (`sips -Z 1600 shot.png` or [Squoosh](https://squoosh.app) will do it)

A screenshot that's missing or misspelled renders as a labelled dashed placeholder telling
you which file it wanted — the layout never breaks.

---

## Contact

The contact section shows a plain `mailto:` link to `kai_xin_chun@moe.edu.sg`, set
directly in `index.html`. There is no form and no third-party form service.

A visible address will be picked up by address-harvesting bots, which is the accepted
trade for being reachable in one click. It is a school address behind institutional
spam filtering and already listed in the MOE staff directory, so the exposure adds
little that was not already public.

Do not put a personal address here. If the school address ever changes, it appears in
exactly one place: search `index.html` for `mailto:`.

## Publishing

```bash
./publish.sh "what you changed"
```

That stages everything, commits, and pushes to `main`. GitHub Pages redeploys on its own
within about a minute. Run it with no argument and it writes a generic commit message.

---

## Structure

```
index.html            markup + data-i18n hooks
style.css             design tokens in :root, then components
script.js             JSON loading, i18n, rendering, form handling
i18n.json             every UI string, bilingual
projects.json         project data, bilingual
talks.json            talks and community contributions, bilingual
assets/
  art/
    mountain-sea.svg  the frontispiece lino block
    ridge-rule.svg    the carved section divider
  screenshots/        project images
publish.sh            commit + push in one command
```

## Prints

`assets/art/prints/specimen.png` is the block print shown beside the "How I design"
section, labelled like a specimen plate. It is hidden entirely until the file exists,
so nothing breaks while it is missing.

Export the artwork itself, cropped to the paper edge: not an Instagram screenshot, which
carries app chrome, like counts and other people's profile pictures. Around 1600px on the
long side, under ~400KB. To use a different print, replace the file and edit the
`specimen.title` and `specimen.meta` keys in `i18n.json`.

## Artwork

`assets/art/` holds two hand-drawn SVG lino blocks: the frontispiece under the hero, and
the carved ridge used as a section divider. They are plain SVG, so they scale to any
screen, weigh about 57KB together, and can be edited by hand or swapped outright.

To replace either one with your own scan, drop the file into `assets/art/` and change the `url(...)` in `style.css` (`.frontispiece` and the
`.section + .section::before` rule). Nothing else depends on them.

---

## Privacy

No analytics, no trackers, no cookies, no third-party scripts.

Two outbound requests exist, and both are worth knowing about:

- **Google Fonts** serves Spectral and Inter. Google sees visitors' IP addresses. Chinese
  text deliberately uses the system serif instead, because a webfont with CJK coverage
  costs megabytes. If you would rather have zero third-party requests, the fix is to
  self-host both fonts: download the woff2 files, drop them in `assets/fonts/`, and swap
  the `<link>` in `index.html` for a couple of `@font-face` rules.
- **Formspree** receives the contact form POST, and only when someone actually submits it.

Language preference is stored in `localStorage` on the visitor's own device.
