import { App, normalizePath, TFolder, TFile } from "obsidian";
import type { Raindrop } from "./raindrop";

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
  const date = new Date(item.created);
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
  const tagsYaml =
    item.tags.length > 0
      ? `[${item.tags.map((t) => `"${t}"`).join(", ")}]`
      : "[]";
  const savedDate = new Date(item.created).toISOString().split("T")[0];

  const frontmatter = [
    "---",
    `id: "${item._id}"`,
    `title: "${item.title.replace(/"/g, '\\"')}"`,
    `url: "${item.link}"`,
    `type: ${type}`,
    `tags: ${tagsYaml}`,
    `saved: ${savedDate}`,
    "---",
  ].join("\n");

  const body: string[] = [];

  body.push(`# ${item.title}`);
  body.push("");
  body.push(`**Source:** [${item.link}](${item.link})`);
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
    if (!existing) {
      await app.vault.createFolder(current);
    } else if (!(existing instanceof TFolder)) {
      throw new Error(`${current} exists but is not a folder`);
    }
  }
}
