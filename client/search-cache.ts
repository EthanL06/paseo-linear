import type { PluginAttachmentItem } from "@getpaseo/plugin";

const MAX_ENTRIES = 50;

// Lives as long as the plugin's client bundle, so results survive closing and reopening the popover.
const cache = new Map<string, PluginAttachmentItem[]>();

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function readCachedIssues(query: string): PluginAttachmentItem[] | undefined {
  return cache.get(normalizeQuery(query));
}

export function writeCachedIssues(query: string, items: PluginAttachmentItem[]): void {
  const key = normalizeQuery(query);
  cache.delete(key);
  cache.set(key, items);
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export function sameIssues(a: readonly PluginAttachmentItem[], b: readonly PluginAttachmentItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => {
    const other = b[index];
    return item.id === other.id && item.title === other.title && item.subtitle === other.subtitle && item.text === other.text;
  });
}

export function clearCachedIssues(): void {
  cache.clear();
}
