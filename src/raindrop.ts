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

    // Validate response shape before accessing fields.
    if (!data || typeof data !== "object") {
      throw new Error("Raindrop API returned an unexpected response format.");
    }
    if (!data.result) break;
    if (!Array.isArray(data.items) || data.items.length === 0) break;

    for (const item of data.items) {
      if (item.type === "link" || item.type === "article") {
        results.push(item);
      }
    }

    // Stop when the last page returns fewer items than requested.
    // Also stop when we've collected all items reported by `count`.
    if (data.items.length < PAGE_SIZE || results.length >= data.count) break;
    page++;
  }

  return results;
}
