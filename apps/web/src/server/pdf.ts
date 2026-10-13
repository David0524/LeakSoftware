import { chromium } from "playwright-core";

// Report PDFs are the report page printed by headless Chromium (BUILD_PLAN 6.3).
// Local and CI: CHROMIUM_PATH (or Playwright's own browser). Vercel: @sparticuz/chromium.

async function launch() {
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
    const page = await browser.newPage();
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

export function reportPdfPath(companyId: string, jobId: string, reportId: string): string {
  return `${companyId}/${jobId}/report-${reportId}.pdf`;
}
