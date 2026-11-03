"""Screenshots every rendered screen at phone + desktop sizes and fails on horizontal overflow."""
import json, sys, pathlib
from playwright.sync_api import sync_playwright

src = pathlib.Path(sys.argv[1]); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
VIEWPORTS = {"se-320": (320, 640), "iphone14-390": (390, 844), "pixel7-412": (412, 915), "desktop-1280": (1280, 860)}
CHECK = """() => {
  const w = document.documentElement.clientWidth;
  const bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || getComputedStyle(el).position === 'fixed' && el.closest('.sheet, .bottom-nav, .chat-input, .cart-bar, .fab') ) continue;
    if (r.right > w + 1 && !el.closest('.chips, .seg')) bad.push((el.className || el.tagName).toString().slice(0, 40) + ' right=' + Math.round(r.right));
  }
  return { scrollW: document.scrollingElement.scrollWidth, clientW: w, bad: bad.slice(0, 5),
           smallTargets: [...document.querySelectorAll('button, a.btn, .nav-item, input, select')].filter(e => { if (e.closest('label')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 30 && !e.closest('.sr-only'); }).length };
}"""
problems = []
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for name, (w, h) in VIEWPORTS.items():
        ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2 if w < 800 else 1, is_mobile=w < 800, has_touch=w < 800)
        page = ctx.new_page()
        for f in sorted(src.glob("*.html")):
            page.goto(f.as_uri())
            page.wait_for_timeout(450)
            res = page.evaluate(CHECK)
            status = "OK " if res["scrollW"] <= res["clientW"] and not res["bad"] else "OVERFLOW"
            if status != "OK ": problems.append((name, f.stem, res))
            print(f"{status} {name:13} {f.stem:28} scroll={res['scrollW']}/{res['clientW']} small_targets={res['smallTargets']} {res['bad'] if res['bad'] else ''}")
            if name in ("iphone14-390", "se-320") or f.stem.startswith(("03", "11", "13")):
                page.screenshot(path=str(out / f"{f.stem}__{name}.png"), full_page=False)
        ctx.close()
    browser.close()
print("\nRESULT:", "FAIL" if problems else "PASS — no horizontal overflow on any screen/size")
sys.exit(1 if problems else 0)
