# kaixinbuilds.github.io

Personal portfolio for **Chun Kai Xin 郑凯欣**: Chinese Language teacher, Head of Department
(Mother Tongue Languages) at Bukit View Secondary School, and EdTech builder.

Static HTML, CSS and vanilla JavaScript. No framework, no dependencies, no analytics.
Live at **https://kaixinbuilds.github.io**

---

## ⚠️ The HTML files are generated

`index.html`, `work.html`, `talks.html`, `approach.html` and `contact.html` are **output**,
along with `sitemap.xml` and `robots.txt`. Editing them directly does nothing lasting: the
next build overwrites your changes. Each generated page carries a banner saying so.

Edit `build.py`, then:

```bash
python3 build.py
```

`publish.sh` runs this before every commit, so what is committed is always the generator's
output.

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
language toggle handles the rest. The toggle stores the choice in `localStorage`, so it
persists across pages.

**Keep Chinese characters out of the English strings.** English readers cannot parse them.
Romanise or translate instead, except for the language toggle itself, which is deliberately
in the language it switches to.

### Adding a project

Append one object to `projects.json`:

```json
{
  "id": "my-new-tool",
  "featured": false,
  "title":   { "en": "My New Tool", "zh": "新工具" },
  "summary": { "en": "One or two sentences.", "zh": "一两句话说明。" },
  "link": "https://…",
  "displayUrl": "example.com/my-new-tool",
  "tags": ["live"]
}
```

- `"featured": true` puts a project in the large block at the top of the Work page and
  unlocks `subtitle`, `stats`, `highlight` and `screenshots`. Exactly one should be featured.
- `"displayUrl"` shows the address in full, as a visible link. This is deliberate: it is
  readable to a person and a real signal pointing search engines at the project.
- `"screenshots"` is an array of `{ src, caption, wide }`. A card with screenshots renders
  wide, with the first one framed beside the text. `"wide": true` on a featured screenshot
  makes it span the full row.
- `"embed": { "src": "…", "aspect": "16 / 10" }` renders a click-to-load iframe instead of a
  screenshot. Currently unused: the S3G3 game needs roughly 800px to be playable and the
  embed slot gives it about 470, so it links out instead. The support remains if a future
  project suits it.

### Adding a talk or post

Append one object to `talks.json`. `"status"` is `"upcoming"` or `"completed"`. Upcoming
entries list nearest-first and completed newest-first, under separate headings. Optional:

- `"award"` for recognition, rendered as its own ochre line
- `"link"` for the write-up itself
- `"links"`, an array of `{ label, url }`, for anything the write-up points at

---

## Content that needs periodic updating

- **After a talk happens**, change its `"status"` from `"upcoming"` to `"completed"` in
  `talks.json`. Nothing does this automatically.

---

## Artwork

`assets/art/prints/` holds the block prints and their masters. They are carved on **rubber**,
not lino. There is no other decorative art: generated illustrations were removed so the
visual language comes from real work rather than an imitation of it. Read the README in that
folder before adding files, particularly the note about case-insensitive filenames.

- `payphone-background.jpg` — recoloured to ink and ochre, fixed behind every page at 30%
- `payphone-block-print.png` — the payphone block, framed on the contact page
- `diskette-block-print.png` — master for `favicon.png` and `apple-touch-icon.png`

Every image on the site opens full screen when clicked. Each carries a ⤢ chip so the
affordance is visible on touch as well as on hover, and each is keyboard reachable.

---

## Design notes

- **One appearance.** There is no dark mode. The palette is warm paper and indigo ink in all
  conditions, and `color-scheme: light` stops browsers darkening form controls underneath it.
- **Glass panels.** Content sits on frosted panels over the fixed print. If the print ever
  feels too present, `opacity` on `body::before` is the single dial.
- **Measure.** Text fills its panel. The panels themselves bound the line length: 1080px on
  Work and Contact, 660px elsewhere.
- **Fonts.** Spectral and Inter come from Google Fonts. Chinese deliberately uses the system
  serif, because a webfont with CJK coverage costs megabytes.

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
build.py                generates the pages, sitemap.xml and robots.txt
style.css               design tokens in :root, then components
script.js               JSON loading, i18n, rendering, disclosure, lightbox
i18n.json               every UI string, bilingual
projects.json           project data, bilingual
talks.json              talks and community contributions, bilingual
favicon.png             the diskette block print
apple-touch-icon.png    the same, for iOS home screens
LICENSE                 all rights reserved; see below
assets/
  art/prints/           block prints and their masters
  screenshots/          project screenshots
publish.sh              build, validate, commit, push
```

---

## Licence

All rights reserved. See `LICENSE`. The repository is public because GitHub Pages serves the
site from it, not as an invitation to reuse. The teaching materials linked from the site are
a separate matter and carry their own terms.

---

## Search

`sitemap.xml` and `robots.txt` are generated by `build.py`, so new pages appear in them
automatically. Static titles, descriptions, Open Graph and canonical tags are written into
each page at build time, because link-preview crawlers read the delivered HTML rather than
the state after client-side translation has run.

Not yet done: verifying the site in Google Search Console and submitting the sitemap.
