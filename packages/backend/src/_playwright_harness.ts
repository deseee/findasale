import { evaluateOnPage } from "./services/scraper/utils/playwrightBrowser";

(async () => {
  const url = process.env.TEST_URL ?? "https://www.fleamarkets.org/nfma-member-markets";
  console.log("Testing evaluateOnPage against:", url);

  const result = await evaluateOnPage(url, () => {
    const richText: string[] = [];
    document.querySelectorAll("[data-testid='richTextElement'] p, [class*='richText'] p").forEach((el) => {
      const t = (el as HTMLElement).textContent?.trim() ?? "";
      if (t.length > 2 && t.length < 200) richText.push(t);
    });

    const pTags: string[] = [];
    document.querySelectorAll("p").forEach((el) => {
      const t = (el as HTMLElement).textContent?.trim() ?? "";
      const words = t.split(/\s+/).filter((w) => w.length > 0);
      if (words.length >= 2 && words.length <= 15 && t.length < 150) pTags.push(t);
    });

    const html = document.documentElement.outerHTML;
    const mid = Math.floor(html.length / 2);

    return {
      totalHtmlLength: html.length,
      richTextSample: richText.slice(0, 20),
      pTagSample: pTags.slice(0, 40),
      midSnippet: html.substring(mid - 500, mid + 2500),
      lastChunk: html.substring(html.length - 3000),
    };
  }, { waitForNetworkIdle: false });

  console.log("HTML length:", result.totalHtmlLength);
  console.log("Rich text sample:", JSON.stringify(result.richTextSample, null, 2));
  console.log("P-tag sample:", JSON.stringify(result.pTagSample, null, 2));
  console.log("Mid-page HTML:", result.midSnippet);
  console.log("Last 3k HTML:", result.lastChunk);
})().catch(e => { console.error(e); process.exit(1); });
