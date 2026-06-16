// YouTube Data API v3 helpers with a quota-aware two-step lookup:
//   1. search.list  (100 units) -> candidate video IDs
//   2. videos.list  (1 unit, batched) -> snippet + duration + stats for ranking

export type RankedVideo = {
  youtubeId: string;
  title: string;
  channelName: string;
  description: string;
  tags: string[];
  duration: number; // seconds
  viewCount: number;
  likeCount: number;
  commentCount: number;
};

function parseISODuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

const popularity = (v: RankedVideo) =>
  Math.log10(v.viewCount + 1) * 2 +
  Math.log10(v.likeCount + 1) +
  Math.log10(v.commentCount + 1) * 0.5;

/**
 * Search YouTube and return a ranked list of candidate videos (most popular
 * first), each including its description + tags so callers can judge relevance
 * and avoid reusing the same video across lessons.
 */
export async function searchCandidates(
  apiKey: string,
  query: string,
  opts: { minSeconds?: number; maxSeconds?: number; limit?: number } = {},
): Promise<RankedVideo[]> {
  const minSeconds = opts.minSeconds ?? 120; // skip very short clips
  const maxSeconds = opts.maxSeconds ?? 5400; // skip multi-hour streams
  const limit = opts.limit ?? 12;

  // Step 1: search.list (100 units)
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "15");
  searchUrl.searchParams.set("relevanceLanguage", "en");
  searchUrl.searchParams.set("videoEmbeddable", "true");
  searchUrl.searchParams.set("safeSearch", "moderate");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl);
  if (!searchRes.ok) {
    throw new Error(
      `YouTube search failed: ${searchRes.status} ${await searchRes.text()}`,
    );
  }
  const searchData = await searchRes.json();
  const ids: string[] = (searchData.items || [])
    .map((it: any) => it.id?.videoId)
    .filter(Boolean);
  if (ids.length === 0) return [];

  // Step 2: videos.list (1 unit) for snippet + duration + stats
  const videoUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  videoUrl.searchParams.set("part", "snippet,contentDetails,statistics");
  videoUrl.searchParams.set("id", ids.join(","));
  videoUrl.searchParams.set("key", apiKey);

  const vidRes = await fetch(videoUrl);
  if (!vidRes.ok) {
    throw new Error(`YouTube videos.list failed: ${vidRes.status}`);
  }
  const vidData = await vidRes.json();

  const candidates: RankedVideo[] = (vidData.items || []).map((it: any) => ({
    youtubeId: it.id,
    title: it.snippet?.title ?? "",
    channelName: it.snippet?.channelTitle ?? "",
    description: it.snippet?.description ?? "",
    tags: (it.snippet?.tags as string[] | undefined) ?? [],
    duration: parseISODuration(it.contentDetails?.duration ?? "PT0S"),
    viewCount: parseInt(it.statistics?.viewCount ?? "0", 10),
    likeCount: parseInt(it.statistics?.likeCount ?? "0", 10),
    commentCount: parseInt(it.statistics?.commentCount ?? "0", 10),
  }));

  const filtered = candidates.filter(
    (c) => c.duration >= minSeconds && c.duration <= maxSeconds,
  );
  const pool = filtered.length > 0 ? filtered : candidates;

  pool.sort((a, b) => popularity(b) - popularity(a));
  return pool.slice(0, limit);
}

/** Backwards-compatible single-best lookup (by popularity). */
export async function searchAndRank(
  apiKey: string,
  query: string,
  opts: { minSeconds?: number; maxSeconds?: number } = {},
): Promise<RankedVideo | null> {
  const list = await searchCandidates(apiKey, query, opts);
  return list[0] ?? null;
}

/**
 * Fraction of lesson keywords that appear in a video's title/description/tags.
 * A simple, quota-free relevance proxy in the range 0..1.
 */
export function relevanceScore(v: RankedVideo, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hay =
    `${v.title} ${v.description} ${(v.tags || []).join(" ")}`.toLowerCase();
  let hits = 0;
  for (const k of keywords) if (hay.includes(k)) hits++;
  return hits / keywords.length;
}

// Words that signal a video actually teaches something.
const INSTRUCTIONAL_MARKERS = [
  "tutorial", "how to", "how-to", "guide", "lesson", "course", "learn",
  "explained", "step by step", "step-by-step", "beginner", "beginners",
  "basics", "fundamentals", "demonstration", "masterclass", "training",
  "walkthrough", "technique", "instructional", "explainer", "crash course",
  "full course", "teaches",
];

// Words that signal entertainment / novelty / news rather than instruction.
const ENTERTAINMENT_MARKERS = [
  "funny", "hilarious", "prank", "reaction", "compilation", "fails",
  "amazing animals", "cute", "shocking", "you won't believe",
  "you wont believe", "meme", "comedy", "satire", "music video", "cartoon",
  "gone wrong", "celebrity", "trailer", "tv show", "sketch", "skit",
  "vlog", "#shorts", "caught on camera", "goes viral", "viral video",
  "talented", "try not to", "news agency", "catersnews", "licensed from",
];

/**
 * Heuristic in the range -1..+1 for whether a video is instructional
 * (positive) versus entertainment/novelty/news (negative). Used to keep
 * keyword-matching but non-teaching clips (e.g. a viral "ponies do CPR" video)
 * from beating real tutorials.
 */
export function instructionalScore(v: RankedVideo): number {
  const hay =
    `${v.title} ${v.description} ${v.channelName} ${(v.tags || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const m of INSTRUCTIONAL_MARKERS) if (hay.includes(m)) score += 0.34;
  for (const m of ENTERTAINMENT_MARKERS) if (hay.includes(m)) score -= 0.5;
  const title = v.title.toLowerCase();
  if (/\b(how to|tutorial|step by step|guide|explained|lesson)\b/.test(title))
    score += 0.4;
  if (
    /\b(funny|hilarious|amazing|prank|reaction|compilation|gone wrong|talented|viral)\b/.test(
      title,
    )
  )
    score -= 0.6;
  return Math.max(-1, Math.min(1, score));
}

/**
 * Fetch up to `max` top (most relevant) comments for a video. Costs 1 quota
 * unit. Returns [] if comments are disabled or the call fails, so callers can
 * degrade gracefully.
 */
export async function fetchTopComments(
  apiKey: string,
  youtubeId: string,
  max = 80,
): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("videoId", youtubeId);
  url.searchParams.set("order", "relevance");
  url.searchParams.set("maxResults", String(Math.min(Math.max(max, 1), 100)));
  url.searchParams.set("textFormat", "plainText");
  url.searchParams.set("key", apiKey);
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return [];
  }
  if (!res.ok) return []; // comments disabled / not found / quota
  let data: any;
  try {
    data = await res.json();
  } catch {
    return [];
  }
  return (data.items || [])
    .map(
      (it: any) =>
        it.snippet?.topLevelComment?.snippet?.textDisplay as
          | string
          | undefined,
    )
    .filter((t: unknown): t is string => typeof t === "string" && t.length > 0)
    .map((t: string) => t.replace(/\s+/g, " ").trim())
    .slice(0, max);
}
