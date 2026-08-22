# kaixinbuilds.github.io

Personal portfolio for **Kaixin Chun** — Chinese Language teacher, HOD/MTL, and independent EdTech builder.

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

## Contact form (Formspree)

The form posts to Formspree so **no email address appears anywhere in this repo or on the
page**. One-time setup:

1. Create a free account at https://formspree.io
2. New form → name it "kaixinbuilds portfolio" → copy the endpoint it gives you
   (looks like `https://formspree.io/f/abcdwxyz`)
3. In `index.html`, replace `YOUR_FORM_ID` in the `<form action="…">` with your id
4. Submit the form once yourself — Formspree emails you a confirmation link to click

Until step 3 is done the form deliberately refuses to submit and says so, rather than
silently swallowing messages.

The free tier allows 50 submissions/month, which is comfortably above what a portfolio
site attracts. A hidden `_gotcha` honeypot field catches most spam bots before they count
against that quota.

---

## Publishing

```bash
./publish.sh "what you changed"
```

That stages everything, commits, and pushes to `main`. GitHub Pages redeploys on its own
within about a minute. Run it with no argument and it writes a generic commit message.

---

## Structure

```
index.html      markup + data-i18n hooks
style.css       design tokens in :root, then components
script.js       JSON loading, i18n, rendering, form handling
i18n.json       every UI string, bilingual
projects.json   project data, bilingual
talks.json      talks and community contributions, bilingual
assets/
  screenshots/  project images
publish.sh      commit + push in one command
```

---

## Privacy

No analytics, no trackers, no cookies, no third-party fonts or scripts. The only outbound
request the page makes is the contact form POST to Formspree, and only when someone
submits it. Language preference is stored in `localStorage` on the visitor's own device.
