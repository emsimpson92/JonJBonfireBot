export function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/** Lowercase and trimmed, with runs of whitespace as one space, so comparisons ignore case and spacing. */
export function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** A Discord timestamp shown as relative time ("in 2 hours"), which counts on its own without edits. */
export function relativeTime(ms: number): string {
  return `<t:${Math.floor(ms / 1000)}:R>`;
}
