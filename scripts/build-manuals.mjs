// Prints the two manuals to PDF (owner, 2026-11-16; docs/plans/2026-11-16-manuals.md). The web
// pages /manual/pool-care and /manual/leak-detection are the manuals; this prints each with its
// print styles into apps/web/public/manual/, which the pages' Download PDF buttons link to.
//
//   pnpm --filter @leakbook/web build && pnpm --filter @leakbook/web start   (in one shell)
//   node scripts/build-manuals.mjs [--base http://localhost:3000]            (in another)
//
// Two passes: the first PDF's outline (built from the headings) says which page each chapter
// starts on; those numbers go into the contents and the page is printed again. Needs python3
// with pypdf to read the outline. Run it again whenever a chapter or screenshot changes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(import.meta.dirname, "..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");
const sharp = require("sharp");

const args = process.argv.slice(2);
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3000";
const out = join(root, "apps/web/public/manual");
const tmp = mkdtempSync(join(tmpdir(), "manuals-"));

const EDITIONS = [
  {
    slug: "pool-care",
    file: "sundeck-pro-pool-care-manual.pdf",
    title: "Sundeck Pro Pool Care Manual",
  },
  {
    slug: "leak-detection",
    file: "sundeck-pro-leak-detection-manual.pdf",
    title: "Sundeck Pro Leak Detection Manual",
  },
];

const PDF = {
  format: "Letter",
  printBackground: true,
  preferCSSPageSize: true,
  outline: true,
  tagged: true,
};

/** Chapter heading text → first page, from the PDF's outline. */
function outlinePages(file) {
  const py = `
import json, sys
from pypdf import PdfReader
r = PdfReader(sys.argv[1])
pages = {}
def walk(items):
    for it in items:
        if isinstance(it, list):
            walk(it)
        else:
            title = it.title.strip()
            if title not in pages:
                pages[title] = r.get_destination_page_number(it) + 1
walk(r.outline)
print(json.dumps({"pages": pages, "count": len(r.pages)}))
`;
  return JSON.parse(execFileSync("python3", ["-c", py, file], { encoding: "utf8" }));
}

/**
 * Headings that land in the bottom third of a page, where the section would start with a line
 * or two and carry on overleaf. `texts` are the candidates' headings in page order; returns
 * the indexes of the stranded ones.
 */
function strandedHeadings(file, texts) {
  const py = `
import json, re, sys
from pypdf import PdfReader
texts = json.loads(sys.argv[2])
norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
keys = [norm(t)[:24] for t in texts]
r = PdfReader(sys.argv[1])
found = set()
for page in r.pages:
    top = float(page.mediabox.height)
    lines = {}
    def visit(text, cm, tm, font, size):
        if text.strip():
            y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
            x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
            lines.setdefault(round(y), []).append((x, text))
    page.extract_text(visitor_text=visit)
    # The text area runs from 0.8 in to 0.7 in below the top; its bottom third is the danger zone.
    limit = 0.8 * 72 + (top - 1.5 * 72) / 3
    for y, parts in lines.items():
        if y > limit:
            continue
        line = norm("".join(t for _, t in sorted(parts)))
        for i, k in enumerate(keys):
            if len(k) >= 6 and i not in found and line.startswith(k):
                found.add(i)
print(json.dumps(sorted(found)))
`;
  return JSON.parse(
    execFileSync("python3", ["-c", py, file, JSON.stringify(texts)], { encoding: "utf8" }),
  );
}

async function ready(page) {
  await page.emulateMedia({ media: "print" });
  await page.evaluate(async () => {
    for (const img of document.images) img.loading = "eager";
    await Promise.all(
      [...document.images].map((img) =>
        img.complete
          ? img.decode().catch(() => {})
          : new Promise((r) => {
              img.onload = img.onerror = () => r();
            }),
      ),
    );
    await document.fonts.ready;
  });
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
try {
  for (const e of EDITIONS) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    // Chromium stores WebP and PNG in a PDF losslessly, which makes the file huge; JPEG goes in
    // as it is. So the screenshots are served to the printer as JPEG.
    await page.route(/\/manual\/(ios|web)\/[^/]+\.webp$/, async (route) => {
      const file = join(root, "apps/web/public", new URL(route.request().url()).pathname);
      const body = await sharp(file)
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      await route.fulfill({ status: 200, contentType: "image/jpeg", body });
    });
    await page.goto(`${base}/manual/${e.slug}`, { waitUntil: "networkidle" });
    await page.evaluate((t) => (document.title = t), e.title);
    await ready(page);

    const first = join(tmp, e.file);
    // Page breaks: a section whose heading lands near the foot of a page starts on the next
    // one instead. Moving one shifts the rest, so repeat until nothing is stranded.
    const candidates = await page.evaluate(() =>
      [...document.querySelectorAll(".m-section > .m-h3")].map((h, i) => {
        h.setAttribute("data-brk", String(i));
        return h.textContent?.trim() ?? "";
      }),
    );
    let moved = 0;
    for (let pass = 0; pass < 6; pass++) {
      await page.pdf({ ...PDF, path: first });
      const stranded = strandedHeadings(first, candidates);
      if (!stranded.length) break;
      moved += stranded.length;
      await page.evaluate((list) => {
        for (const i of list) {
          const h = document.querySelector(`[data-brk="${i}"]`);
          (h?.classList.contains("m-h3") ? h.parentElement : h)?.classList.add("m-break");
        }
      }, stranded);
    }
    await page.pdf({ ...PDF, path: first });
    const { pages, count } = outlinePages(first);

    // The chapters' headings (id → text) as the outline names them.
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll("[data-toc-page]")].map((el) => {
        const id = el.getAttribute("data-toc-page");
        // A chapter's title, or a section's heading (the "How do I…?" index links to both).
        const target = document.getElementById(`${id}-title`) ?? document.getElementById(id);
        return { id, text: target?.textContent?.trim() ?? "" };
      }),
    );
    const numbers = Object.fromEntries(headings.map((h) => [h.id, pages[h.text]]));
    const missing = headings.filter((h) => !numbers[h.id]).map((h) => h.text);
    if (missing.length) console.warn(`  ${e.slug}: no page found for: ${missing.join(", ")}`);
    await page.evaluate((n) => {
      for (const el of document.querySelectorAll("[data-toc-page]")) {
        const v = n[el.getAttribute("data-toc-page")];
        if (v) el.textContent = String(v);
      }
    }, numbers);

    const final = join(out, e.file);
    await page.pdf({ ...PDF, path: final });
    const mb = (statSync(final).size / 1e6).toFixed(1);
    console.log(`${e.file}: ${count} pages, ${mb} MB, ${moved} sections moved to a new page`);
    await page.close();
  }
} finally {
  await browser.close();
}
