import { App, normalizePath, TFolder, TFile } from "obsidian";
import type { Raindrop } from "./raindrop";

const SAFE_URL_SCHEMES = ["http:", "https:"];

/**
 * Returns the URL only if it uses a safe scheme (http/https).
 * Blocks javascript:, data:, vbscript: etc. from being embedded in markdown.
 */
function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (SAFE_URL_SCHEMES.includes(parsed.protocol)) return url;
  } catch {
    // fall through
  }
  return "";
}

/**
 * Escapes a string for safe embedding inside a YAML double-quoted scalar.
 * Handles backslashes, double quotes, and control characters (newlines, tabs).
 */
function yamlEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")   // backslash first
    .replace(/"/g, '\\"')      // double quote
    .replace(/\r?\n/g, "\\n") // newlines
    .replace(/\t/g, "\\t");   // tabs
}

const TWEET_DOMAINS = ["twitter.com", "x.com", "t.co"];

function isTweet(link: string): boolean {
  try {
    const host = new URL(link).hostname.replace(/^www\./, "");
    return TWEET_DOMAINS.includes(host);
  } catch {
    return false;
  }
}

/**
 * Sanitizes a string for use as a filename by removing characters that are
 * problematic on common operating systems.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Returns the vault path for a raindrop item.
 * Pattern: {syncFolder}/YYYY/MM/DD/{sanitized-title}.md
 */
export function notePathFor(item: Raindrop, syncFolder: string): string {
  const raw = new Date(item.created);
  // Guard against invalid dates from the API.
  const date = isNaN(raw.getTime()) ? new Date() : raw;
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const filename = sanitizeFilename(item.title || item.domain || item._id);
  return normalizePath(`${syncFolder}/${yyyy}/${mm}/${dd}/${filename}.md`);
}

/**
 * Builds the YAML frontmatter + body content for a raindrop note.
 */
function buildNoteContent(item: Raindrop, articleText: string): string {
  const type = isTweet(item.link) ? "tweet" : item.type;
  // Escape every tag value for YAML double-quoted scalars.
  const tagsYaml =
    item.tags.length > 0
      ? `[${item.tags.map((t) => `"${yamlEscape(t)}"`).join(", ")}]`
      : "[]";
  const raw = new Date(item.created);
  const savedDate = isNaN(raw.getTime())
    ? new Date().toISOString().split("T")[0]
    : raw.toISOString().split("T")[0];

  // Sanitize the URL — only embed http/https links.
  const safeUrl = sanitizeUrl(item.link);

  const frontmatter = [
    "---",
    `id: "${yamlEscape(item._id)}"`,
    `title: "${yamlEscape(item.title)}"`,
    `url: "${yamlEscape(safeUrl)}"`,
    `type: ${type}`,
    `tags: ${tagsYaml}`,
    `saved: ${savedDate}`,
    "---",
  ].join("\n");

  const body: string[] = [];

  // Use plain text title in the heading (no markdown injection risk since we
  // don't execute headings, but strip leading # chars to be safe).
  const safeTitle = item.title.replace(/^#+\s*/, "");
  body.push(`# ${safeTitle}`);
  body.push("");
  if (safeUrl) {
    body.push(`**Source:** [${safeUrl}](${safeUrl})`);
  } else {
    body.push(`**Source:** ${item.link} *(unsafe URL — link disabled)*`);
  }
  body.push("");

  if (item.note && item.note.trim()) {
    body.push(`> ${item.note.trim()}`);
    body.push("");
  }

  if (articleText && articleText.trim()) {
    body.push("## Content");
    body.push("");
    body.push(articleText.trim());
  }

  return frontmatter + "\n\n" + body.join("\n");
}

/**
 * Creates intermediate folders and writes the note file.
 * Returns the path of the created file.
 */
export async function writeNote(
  app: App,
  item: Raindrop,
  articleText: string,
  syncFolder: string
): Promise<string> {
  const filePath = notePathFor(item, syncFolder);
  const dirPath = filePath.substring(0, filePath.lastIndexOf("/"));

  await ensureFolder(app, dirPath);

  const content = buildNoteContent(item, articleText);

  const existing = app.vault.getAbstractFileByPath(filePath);
  if (existing instanceof TFile) {
    // Should not happen (we check syncState first), but guard anyway.
    return filePath;
  }

  await app.vault.create(filePath, content);
  return filePath;
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) {
      throw new Error(`${current} exists but is not a folder`);
    }
    try {
      await app.vault.createFolder(current);
    } catch (err) {
      // Another concurrent sync may have created the folder between our check
      // and the createFolder call. Re-check and only rethrow if it's still absent.
      if (!(app.vault.getAbstractFileByPath(current) instanceof TFolder)) {
        throw err;
      }
    }
  }
}
