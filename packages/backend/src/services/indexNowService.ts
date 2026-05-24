/**
 * IndexNow service — notifies search engines of new/updated URLs immediately.
 * Docs: https://www.indexnow.org/documentation
 */

const INDEX_NOW_KEY = process.env.INDEX_NOW_KEY || 'fa3d9e1b8c2047a6d5f3e9b1c4a87d20';
const SITE_URL = process.env.SITE_URL || 'https://finda.sale';
const INDEX_NOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;

  const payload = {
    host: 'finda.sale',
    key: INDEX_NOW_KEY,
    keyLocation: `${SITE_URL}/${INDEX_NOW_KEY}.txt`,
    urlList: urls.slice(0, 10000), // IndexNow limit
  };

  const response = await fetch(INDEX_NOW_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`IndexNow returned ${response.status}`);
  }
}

export async function pingIndexNowForSale(
  saleId: string,
  itemIds: string[]
): Promise<void> {
  const urls = [
    `${SITE_URL}/sales/${saleId}`,
    ...itemIds.map((id) => `${SITE_URL}/items/${id}`),
  ];
  await pingIndexNow(urls);
}
