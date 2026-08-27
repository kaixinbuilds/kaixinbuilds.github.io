#!/usr/bin/env python3
"""Round-trip the NLC page's Chinese copy through one editable file.

    python3 nlc-copy.py export        # write the file for proofreading
    python3 nlc-copy.py import        # read your edits back into i18n.json

Only Chinese is exported. English is not, on purpose: the English is a
translation of whatever the Chinese finally says, so it is rewritten after
the Chinese is settled rather than proofread alongside it.

Order comes from parsing the built page, so the document always reads in the
same order as the page and cannot drift out of step with it.
"""
import json, re, sys, pathlib, collections, datetime

HERE = pathlib.Path(__file__).parent
PAGE = HERE / "2026AIinSecCLNLC.html"
I18N = HERE / "i18n.json"
DEFAULT = pathlib.Path.home() / "Downloads" / "NLC文案-待校对.md"

# What each element is, so you can see at a glance what you are editing.
KIND = {
    "h1": "标题", "h2": "标题", "h3": "小标题",
    "span": "标签", "a": "按钮", "figcaption": "图说",
}
RULE = "════════════════════════════════════════"


def entries():
    """Every nlc26 string on the page, in reading order, grouped by block."""
    html = PAGE.read_text()
    body = html[html.index('<div class="project-detail">'):]

    # split into doc-blocks so the export carries the page's own sections
    parts = re.split(r'<div class="doc-block" id="([a-z-]+)">', body)
    out = collections.OrderedDict()
    for i in range(1, len(parts), 2):
        block, chunk = parts[i], parts[i + 1]
        found = []
        for tag, attrs in re.findall(r'<(\w+)([^>]*\bdata-i18n="[^"]+"[^>]*)>', chunk):
            if 'data-i18n-attr' in attrs:      # alt text, not visible copy
                continue
            key = re.search(r'data-i18n="([^"]+)"', attrs).group(1)
            cls = re.search(r'class="([^"]*)"', attrs)
            cls = cls.group(1) if cls else ""
            if key.startswith("nlc26.") and not any(k == key for k, _ in found):
                kind = "引言" if "section-sub" in cls else KIND.get(tag, "")
                found.append((key, kind))
        if found:
            out[block] = found
    return out


def block_titles(i18n):
    """Section names for the export, taken from the sidebar labels."""
    nav = ["navGoals", "navSession", "navVs", "navStory",
           "navStack", "navHands", "navQ"]
    ids = ["goals", "session", "vocabsummit", "how-it-started",
           "stack", "hands-on", "concerns"]
    return {b: i18n.get("nlc26." + n, {}).get("zh", b) for b, n in zip(ids, nav)}


def do_export(dest):
    i18n = json.loads(I18N.read_text())
    titles = block_titles(i18n)
    L = []
    L.append("# NLC 页面文案 · 只校对中文")
    L.append("")
    L.append(f"{datetime.date.today().isoformat()} 由 nlc-copy.py 从线上页面导出。")
    L.append("https://kaixinbuilds.github.io/2026AIinSecCLNLC.html")
    L.append("")
    L.append("## 怎么改")
    L.append("")
    L.append("1. **要改字**：直接改 `[...]` 下面那几行中文。")
    L.append("2. **整段不要了**：把那一段连同它上面的 `[...]` 一起删掉。")
    L.append("3. 顺序不要动，`[...]` 里的代号也不要动。")
    L.append("4. 改完存档，告诉我。英文我按最后定下的中文重写，你不必看英文。")
    L.append("")
    L.append("删掉一段就是真的从页面上拿掉，所以放心删。")
    L.append("")
    for block, items in entries().items():
        L.append(RULE)
        L.append(f"## {titles.get(block, block)}")
        L.append(RULE)
        L.append("")
        for key, kind in items:
            zh = i18n.get(key, {}).get("zh", "")
            L.append(f"[{key}]" + (f"  · {kind}" if kind else ""))
            L.append(zh)
            L.append("")
    dest.write_text("\n".join(L))
    n = sum(len(v) for v in entries().values())
    print(f"{dest}\n{n} strings, Chinese only")


def do_import(src):
    if not src.exists():
        sys.exit(f"not found: {src}")
    i18n = json.loads(I18N.read_text(), object_pairs_hook=collections.OrderedDict)

    edited = {}
    key, buf = None, []
    def flush():
        if key is not None:
            edited[key] = "\n".join(buf).strip()
    for line in src.read_text().splitlines():
        m = re.match(r'^\[(nlc26\.[A-Za-z0-9]+)\]', line)
        if m:
            flush()
            key, buf = m.group(1), []
        elif key is not None:
            if line.startswith(("#", "═")):
                flush(); key, buf = None, []
            else:
                buf.append(line)
    flush()

    on_page = [k for items in entries().values() for k, _ in items]
    changed, deleted, blanked = [], [], []
    for k in on_page:
        if k not in edited:
            deleted.append(k)
        elif not edited[k]:
            blanked.append(k)
        elif edited[k] != i18n.get(k, {}).get("zh", ""):
            changed.append(k)

    for k in changed:
        i18n[k]["zh"] = edited[k]
    I18N.write_text(json.dumps(i18n, ensure_ascii=False, indent=2) + "\n")

    print(f"changed  {len(changed)}")
    for k in changed:
        print(f"  {k}\n    {edited[k][:70]}")
    print(f"\nremoved  {len(deleted) + len(blanked)}")
    for k in deleted + blanked:
        print(f"  {k}")
    if deleted or blanked:
        print("\nThe removed keys still need taking out of build.py and i18n.json.")
    if changed:
        print("\nThe English for the changed keys is now stale and needs rewriting.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "export"
    path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT
    if cmd == "export":
        do_export(path)
    elif cmd == "import":
        do_import(path)
    else:
        sys.exit(__doc__)
