// Report PDFs are the report page printed by headless Chromium (BUILD_PLAN 6.3).
// Local and CI: CHROMIUM_PATH (or Playwright's own browser). Vercel: @sparticuz/chromium.

import { shrinkForPrint } from "./print-image";

async function launch() {
  // Loaded here, not at the top, so pages that only import report helpers never load it.
  const { chromium } = await import("playwright-core");
  if (process.env.CHROMIUM_PATH) {
    return chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  }
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      executablePath: await serverless.executablePath(),
      args: serverless.args,
    });
  }
  return chromium.launch();
}

/** Renders a page of this site (e.g. /r/{token}?print=1) to a Letter-size PDF. */
export async function renderPdf(url: string): Promise<Buffer> {
  const browser = await launch();
  try {
    // 1x, so each image is embedded once at its CSS size and no higher.
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    // Photos and the logo are shrunk for print as the page loads them (print-image.ts).
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() !== "image") return route.continue();
      try {
        const response = await route.fetch();
        const small = response.ok() ? await shrinkForPrint(await response.body()) : null;
        if (!small) return await route.fulfill({ response });
        return await route.fulfill({
          response,
          body: small.body,
          headers: { ...response.headers(), "content-type": small.contentType },
        });
      } catch {
        return route.continue().catch(() => {});
      }
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/** Changes when the printed file changes (2026-10-26: photos shrunk for print). */
export const PDF_LAYOUT = "p2";

export function reportPdfPath(
  companyId: string,
  jobId: string,
  reportId: string,
  layout?: string,
): string {
  return `${companyId}/${jobId}/report-${reportId}${layout ? `-${layout}` : ""}.pdf`;
}
