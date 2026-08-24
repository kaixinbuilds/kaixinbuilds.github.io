#!/usr/bin/env python3
"""Write every visible string on the site to one bilingual markdown file.

    python3 export-text.py [destination]

Ordered the way a visitor reads the site rather than the way the files are
organised, so the document can be proofread straight through. Driven by
parsing what each built page actually renders, so it cannot drift out of step
with the site the way a hand-maintained list would.
"""
import json, re, sys, pathlib, datetime

HERE = pathlib.Path(__file__).parent
DEST = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else \
       pathlib.Path.home() / "Downloads" / "kaixinbuilds-all-text.md"

i18n = json.loads((HERE / "i18n.json").read_text())
projects = json.loads((HERE / "projects.json").read_text())
talks = json.loads((HERE / "talks.json").read_text())

PAGES = [("index.html", "Home"), ("work.html", "Work"), ("talks.html", "Connect"),
         ("approach.html", "Practice"), ("contact.html", "Contact")]

# Quotations and the address live in build.py, not in i18n.json, so they are
# listed separately rather than being silently absent.
EPIGRAPHS = {
    "Home": ("不满是向上的车轮",
             "Discontent is the wheel that carries us forward.",
             "鲁迅《热风 · 随感录六十一》 / Lu Xun, Random Thoughts 61"),
    "Practice": ("纸上得来终觉浅，绝知此事要躬行",
                 "What is learnt on paper stays shallow. To truly know a thing, "
                 "you have to do it yourself.",
                 "陆游《冬夜读书示子聿》"),
}

def keys_in(html, start=None, end=None):
    seg = html
    if start and start in html:
        seg = html[html.index(start):html.index(end)] if end and end in html else html[html.index(start):]
    out = []
    for k in re.findall(r'data-i18n(?:-attr|-aria-label)?="([^"]+)"', seg):
        if k in i18n and k not in out:
            out.append(k)
    return out

home = (HERE / "index.html").read_text()
chrome = keys_in(home[:home.index('<main id="main">')])
per_page = {}
for f, name in PAGES:
    h = (HERE / f).read_text()
    per_page[name] = [k for k in keys_in(h, '<main id="main">', "</main>") if k not in chrome]

# Keys can be reached three ways: a data-i18n attribute, a literal t('key')
# call, or a lookup built at runtime such as data.i18n['brand.a'] or
# t('talks.' + status). Matching the key name anywhere in the sources catches
# all three; matching only t('...') silently reports live keys as unused.
sources = "".join((HERE / f).read_text() for f in
                  ("script.js", "build.py", "index.html", "work.html",
                   "talks.html", "approach.html", "contact.html"))
dynamic = sorted(k for k in i18n
                 if k != "_comment" and (f"'{k}'" in sources or f'"{k}"' in sources))
dynamic += [k for k in ("talks.upcoming", "talks.completed")
            if k in i18n and k not in dynamic]

out = []
def w(x=""): out.append(x)
def entry(label, en, zh, note=""):
    w(f"**{label}**" + (f"  ·  {note}" if note else "")); w()
    w(f"- **EN**  {en}"); w(f"- **ZH**  {zh}"); w()
def key(k):
    v = i18n.get(k)
    if isinstance(v, dict) and "en" in v:
        entry(f"`{k}`", v["en"], v["zh"])

w("# kaixinbuilds — every visible string, bilingual"); w()
w(f"Generated {datetime.date.today().isoformat()} by `export-text.py`, from the live content files."); w()
w("Ordered the way a visitor reads the site, page by page."); w()
w("**To change something:** edit the text here and say which entries changed, or edit the")
w("source directly. The `key` names map to `i18n.json`; project and talk entries map to")
w("`projects.json` and `talks.json`. Anything marked *set in build.py* is markup, not data."); w()
w("---"); w()
w("## Header, on every page"); w()
for k in chrome: key(k)
w("The language buttons read 华文 / 双语 / English. They are language names and are never")
w("translated."); w()
w("---"); w()

for f, name in PAGES:
    w(f"## {name} page  ·  `{f}`"); w()
    if name in EPIGRAPHS:
        zh, en, src = EPIGRAPHS[name]
        w("**Epigraph**  ·  *set in build.py*, identical in every language mode"); w()
        w(f"- {zh}"); w(f"- *{en}*"); w(f"- {src}"); w()
    for k in per_page[name]: key(k)

    if name == "Work":
        w("### Projects  ·  `projects.json`"); w()
        for p in projects:
            w(f"#### {p['title']['en']}  ·  `{p['id']}`"
              + ("  ·  *flagship*" if p.get("featured") else "")); w()
            entry("title", p["title"]["en"], p["title"]["zh"])
            if p.get("subtitle"): entry("subtitle", p["subtitle"]["en"], p["subtitle"]["zh"])
            entry("summary", p["summary"]["en"], p["summary"]["zh"])
            if p.get("highlight"): entry("highlight", p["highlight"]["en"], p["highlight"]["zh"])
            for s in p.get("stats", []):
                entry(f"stat  {s['value']}", s["label"]["en"], s["label"]["zh"])
            for n, s in enumerate(p.get("screenshots", []), 1):
                entry(f"screenshot {n} caption", s["caption"]["en"], s["caption"]["zh"])
            for l in p.get("links", []):
                entry("extra link", l["label"]["en"], l["label"]["zh"], l["url"])
            if p.get("displayUrl"): w(f"URL shown on the card: `{p['displayUrl']}`"); w()

    if name == "Connect":
        w("### Entries  ·  `talks.json`"); w()
        for t in sorted(talks, key=lambda x: x["date"], reverse=True):
            w(f"#### {t['dateLabel']['en']}  ·  `{t['id']}`  ·  *{t['status']}*"); w()
            entry("title", t["title"]["en"], t["title"]["zh"])
            entry("date label", t["dateLabel"]["en"], t["dateLabel"]["zh"])
            entry("venue", t["venue"]["en"], t["venue"]["zh"], t.get("venueUrl", ""))
            entry("summary", t["summary"]["en"], t["summary"]["zh"])
            if t.get("award"): entry("award", t["award"]["en"], t["award"]["zh"])
            if t.get("link"): w(f"Link: {t['link']}"); w()
            for l in t.get("links", []):
                entry("extra link", l["label"]["en"], l["label"]["zh"], l["url"])

    if name == "Contact":
        w("The address `kai_xin_chun@moe.edu.sg` is *set in build.py*."); w()
    w("---"); w()

listed = set(chrome + sum(per_page.values(), []))
rest = [k for k in dynamic if k not in listed]
if rest:
    w("## Rendered by script, seen on more than one page"); w()
    for k in rest: key(k)
    listed |= set(rest)
    w("---"); w()

w("## Page titles and search descriptions"); w()
w("Seen in the browser tab, in search results, and when a link is shared."); w()
meta = sorted(k for k in i18n if k.startswith("page.") or k == "site.description")
for k in meta: key(k)
listed |= set(meta)
w("---"); w()

leftover = sorted(set(i18n) - listed - {"_comment"})
if leftover:
    w("## Unused"); w()
    w("Still in `i18n.json` but rendered nowhere. Safe to delete."); w()
    for k in leftover: key(k)
else:
    w("## Unused"); w()
    w("None. Every string in `i18n.json` is rendered somewhere."); w()

DEST.write_text("\n".join(out))
covered = sum(1 for k in i18n if k != "_comment" and f"`{k}`" in "\n".join(out))
print(f"{DEST}")
print(f"{covered} of {len([k for k in i18n if k != '_comment'])} strings covered")
