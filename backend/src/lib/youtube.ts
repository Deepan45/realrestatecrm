const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
];

/** Pull the 11-character video ID out of any YouTube URL/embed-code format; null if none match. */
export function extractYouTubeId(input: string): string | null {
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function youtubeEmbedUrl(input: string): string | null {
  const id = extractYouTubeId(input);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}
