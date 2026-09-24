export type ChatSource = {
  title: string;
  url: string;
};

/**
 * Extracts a conservative list of URLs from the assistant response.
 * The model is instructed to place sources in a dedicated SOURCES section.
 */
export function extractChatSources(text: string): ChatSource[] {
  const matches = text.match(/https?:\/\/[^\s)<>]+/g) ?? [];
  const unique = [...new Set(matches.map((url) => url.replace(/[.,;:!?]+$/, "")))];

  return unique.slice(0, 8).map((url) => ({
    title: url,
    url,
  }));
}
