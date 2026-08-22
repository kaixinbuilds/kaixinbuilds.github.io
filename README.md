# kaixinbuilds.github.io

Personal portfolio for **Chun Kai Xin 郑凯欣**: Chinese Language teacher, Head of Department
(Mother Tongue Languages) at Bukit View Secondary School, and independent EdTech builder.

Static HTML, CSS and vanilla JavaScript. No framework, no dependencies.
Live at **https://kaixinbuilds.github.io**

---

## ⚠️ The HTML files are generated

`index.html`, `work.html`, `talks.html`, `approach.html` and `contact.html` are **output**.
Editing them directly does nothing lasting: the next build overwrites your changes.

Edit `build.py`, then:

```bash
python3 build.py
```

`publish.sh` runs this before every commit, so what is committed is always the generator's
output. Each generated file carries a banner saying so.

---

## Running it locally

The pages read their content from JSON, and browsers block `fetch()` for pages opened
straight from disk (`file://`). Serve the folder over HTTP instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

---

## Where to edit what

| I want to… | Edit this |
|---|---|
| Add or change a project | `projects.json` |
| Add a talk, post or community contribution | `talks.json` |
| Change any wording on the page | `i18n.json` |
| Change page structure, nav, or `<head>` metadata | `build.py`, then rebuild |
| Change colours, spacing, typography | `style.css` (the `:root` block at the top) |
| Change the contact email | `build.py`, search for `mailto:` |

Every content string is bilingual: `{ "en": "…", "zh": "…" }`. Fill in both sides and the
language toggle handles the rest.

### Adding a project

Append one object to `projects.json`:

```json
{
  "id": "my-new-tool",
  "featured": false,
  "title":   { "en": "My New Tool", "zh": "新工具" },
  "summary": { "en": "One or two sentences.", "zh": "一两句话说明。" },
  "link": "https://…",
  "tags": ["live"]
}
```

`"featured": true` puts a project in the large block at the top of the Work page and unlocks
`subtitle`, `stats`, `highlight` and `screenshots`. Exactly one project should be featured.

An optional `"embed": { "src": "…", "aspect": "16 / 10" }` renders a click-to-load iframe
inside a screen bezel, spanning the full grid width.

### Adding a talk or post

Append one object to `talks.json`. `"status"` is `"upcoming"` or `"completed"`; upcoming
entries list nearest-first, completed newest-first, under separate headings. Optional
fields: `"award"` for recognition, `"link"` for the write-up itself, and `"links"` (an
array of `{label, url}`) for anything the write-up points at.

---

## Content that needs periodic updating

- **After a talk happens**, change its `"status"` from `"upcoming"` to `"completed"` in
  `talks.json`. Nothing does this automatically.

---

## Artwork

`assets/art/prints/` holds the block prints and their masters. There is no other decorative
art on the site: generated illustrations were removed so that the visual language comes from
real work rather than an imitation of it. See the README in that folder before adding files,
particularly the note about case-insensitive filenames.

- `payphone-background.jpg` — recoloured to ink and ochre, fixed behind every page
- `payphone-print.png` — the payphone block, shown as a specimen on the Approach page
- `diskette-print.png` — master for `favicon.png` and `apple-touch-icon.png`

---

## Contact

The Contact page shows a plain `mailto:` link to the school address. There is no form and no
third-party form service. A visible address will be picked up by harvesting bots, which is
the accepted trade for being reachable in one click; it is a school address behind
institutional filtering and already in the MOE staff directory.

---

## Publishing

```bash
./publish.sh "what you changed"
```

Rebuilds the pages, validates all three JSON files, then commits and pushes. GitHub Pages
redeploys within about a minute. The JSON check matters: a stray comma would blank the page
and Pages gives no warning.

---

## Structure

```
build.py              generates the five HTML pages from one shared shell
style.css             design tokens in :root, then components
script.js             JSON loading, i18n, rendering, disclosure, embeds
i18n.json             every UI string, bilingual
projects.json         project data, bilingual
talks.json            talks and community contributions, bilingual
favicon.png           the diskette print
apple-touch-icon.png  the same, for iOS home screens
assets/
  art/prints/         block prints and their masters
  screenshots/        project screenshots
publish.sh            build, validate, commit, push
```

---

## Privacy and third parties

No analytics, no trackers, no cookies, no third-party scripts.

- **Google Fonts** serves Spectral and Inter, so Google sees visitors' IP addresses. Chinese
  deliberately uses the system serif, because a webfont with CJK coverage costs megabytes.
  To remove this dependency entirely, self-host both fonts and swap the `<link>` in
  `build.py` for `@font-face` rules.
- **The S3G3 game** is embedded from the same origin and only loads when someone presses
  play. It needs a keyboard, so the play button is hidden on touch-only devices.

Language preference is stored in `localStorage` on the visitor's own device.
