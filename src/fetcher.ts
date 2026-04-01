import { requestUrl } from "obsidian";
import { Readability } from "@mozilla/readability";
import { parse as parseHtml } from "node-html-parser";
import type { Raindrop } from "./raindrop";

const TWEET_DOMAINS = ["twitter.com", "x.com", "t.co"];

function isTweet(item: Raindrop): boolean {
  try {
    const host = new URL(item.link).hostname.replace(/^www\./, "");
    return TWEET_DOMAINS.includes(host);
  } catch {
    return false;
  }
}

/**
 * Attempts to fetch article text for a raindrop item.
 *
 * Strategy:
 * 1. If the item is a tweet, skip — return empty string (Twitter blocks scrapers).
 * 2. Use Raindrop's cached excerpt if it's substantial (> 200 chars).
 * 3. Otherwise fetch the URL and parse with Readability.
 *
 * Returns plain-text article body, or empty string on failure.
 */
export async function fetchArticleText(item: Raindrop): Promise<string> {
  if (isTweet(item)) return "";

  // Step 1 — use Raindrop cache if good enough
  if (item.excerpt && item.excerpt.length > 200) {
    return item.excerpt;
  }

  // Step 2 — live fetch + Readability parse
  try {
    const response = await requestUrl({
      url: item.link,
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ObsidianRaindropSync/1.0)",
      },
    });

    if (response.status !== 200) return item.excerpt ?? "";

    // node-html-parser → DOM-like object → feed to Readability via DOMParser shim
    const root = parseHtml(response.text);

    // Build a minimal Document-like object Readability can consume.
    const doc = buildDocumentShim(root, item.link);
    const reader = new Readability(doc);
    const parsed = reader.parse();

    if (parsed?.textContent && parsed.textContent.trim().length > 0) {
      return parsed.textContent.trim();
    }

    // Fall back to Raindrop excerpt even if short
    return item.excerpt ?? "";
  } catch {
    return item.excerpt ?? "";
  }
}

// ---------------------------------------------------------------------------
// Minimal document shim so Readability works outside a real browser DOM.
// ---------------------------------------------------------------------------

function buildDocumentShim(root: ReturnType<typeof parseHtml>, url: string): Document {
  // Readability only needs a handful of Document methods/props.
  const shim = {
    documentURI: url,
    baseURI: url,
    title: root.querySelector("title")?.text ?? "",
    documentElement: adaptNode(root),
    body: adaptNode(root.querySelector("body") ?? root),
    getElementById: (id: string) => adaptNode(root.querySelector(`#${id}`)),
    getElementsByTagName: (tag: string) =>
      Array.from(root.querySelectorAll(tag)).map(adaptNode),
    querySelector: (sel: string) => adaptNode(root.querySelector(sel)),
    querySelectorAll: (sel: string) =>
      Array.from(root.querySelectorAll(sel)).map(adaptNode),
    createElementNS: (_ns: string, tag: string) => ({
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
    }),
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
    }),
  };
  return shim as unknown as Document;
}

function adaptNode(node: ReturnType<typeof parseHtml> | null): Element {
  if (!node) return null as unknown as Element;

  const adapted: Record<string, unknown> = {
    tagName: (node as { rawTagName?: string }).rawTagName?.toUpperCase() ?? "DIV",
    nodeName: (node as { rawTagName?: string }).rawTagName?.toUpperCase() ?? "DIV",
    nodeType: 1,
    textContent: node.text,
    innerHTML: node.innerHTML,
    outerHTML: node.outerHTML,
    getAttribute: (attr: string) => (node as { getAttribute?: (a: string) => string | null }).getAttribute?.(attr) ?? null,
    setAttribute: () => {},
    hasAttribute: (attr: string) => (node as { hasAttribute?: (a: string) => boolean }).hasAttribute?.(attr) ?? false,
    removeAttribute: () => {},
    children: [] as Element[],
    childNodes: [] as ChildNode[],
    parentNode: null,
    parentElement: null,
    nextSibling: null,
    previousSibling: null,
    style: {},
    classList: {
      contains: () => false,
      add: () => {},
      remove: () => {},
      toString: () => "",
    },
    querySelectorAll: (sel: string) =>
      Array.from((node as { querySelectorAll: (s: string) => Iterable<ReturnType<typeof parseHtml>> }).querySelectorAll(sel)).map(adaptNode),
    querySelector: (sel: string) =>
      adaptNode((node as { querySelector: (s: string) => ReturnType<typeof parseHtml> | null }).querySelector(sel)),
    cloneNode: () => adapted,
  };

  // Adapt child elements
  adapted.children = node.childNodes
    .filter((c): c is ReturnType<typeof parseHtml> => (c as { nodeType?: number }).nodeType === 1)
    .map(adaptNode) as Element[];
  adapted.childNodes = adapted.children as unknown as ChildNode[];

  return adapted as unknown as Element;
}
