const STORAGE_KEY = 'admin-view-tags';
const MAX_TAG_COUNT = 50;
const MAX_TAG_LENGTH = 128;

export function normalizeAdminViewTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const candidate of tags) {
    if (typeof candidate !== 'string') continue;
    const tag = candidate.trim();
    const key = tag.toLocaleLowerCase();
    if (!tag || tag.length > MAX_TAG_LENGTH || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length === MAX_TAG_COUNT) break;
  }
  return normalized;
}

export function getAdminViewTags(): string[] {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    return normalizeAdminViewTags(JSON.parse(raw));
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function setAdminViewTags(tags: string[]): string[] {
  const normalized = normalizeAdminViewTags(tags);
  if (normalized.length === 0) {
    sessionStorage.removeItem(STORAGE_KEY);
  } else {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function clearAdminViewTags() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function encodeAdminViewTagsHeader(tags: string[]): string {
  return normalizeAdminViewTags(tags).map(tag => encodeURIComponent(tag)).join(',');
}
