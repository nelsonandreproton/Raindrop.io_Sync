import { requestUrl } from "obsidian";

const BASE = "https://api.raindrop.io/rest/v1";

export type RaindropType = "link" | "article" | "image" | "video" | "document" | "audio";

export interface Raindrop {
  _id: string;
  title: string;
  link: string;
  excerpt: string;
  note: string;
  tags: string[];
  created: string;   // ISO date
  lastUpdate: string;
  type: RaindropType;
  domain: string;
}

interface ApiResponse {
  result: boolean;
  items: Raindrop[];
  count: number;
}

/**
 * Fetches all raindrops from a collection, following pagination.
 * Only returns items with type "link" (tweets are links) or "article".
 */
export async function fetchCollection(
  token: string,
  collectionId: string
): Promise<Raindrop[]> {
  const PAGE_SIZE = 50;
  const results: Raindrop[] = [];
  let page = 0;

  while (true) {
    const url =
      `${BASE}/raindrops/${collectionId}` +
      `?perpage=${PAGE_SIZE}&page=${page}&sort=-created`;

    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status !== 200) {
      throw new Error(
        `Raindrop API error ${response.status}: ${response.text}`
      );
    }

    const data: ApiResponse = response.json;

    if (!data.result || data.items.length === 0) break;

    for (const item of data.items) {
      if (item.type === "link" || item.type === "article") {
        results.push(item);
      }
    }

    // If we received fewer items than the page size we're on the last page.
    if (data.items.length < PAGE_SIZE) break;
    page++;
  }

  return results;
}
