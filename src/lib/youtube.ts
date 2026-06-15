// YouTube Data API v3 helpers with a quota-aware two-step lookup:
//   1. search.list  (100 units) -> candidate video IDs
//   2. videos.list  (1 unit, batched) -> duration + statistics for ranking

export type RankedVideo = {
  youtubeId: string;
  title: string;
  channelName: string;
  duration: number; // seconds
  viewCount: number;
  likeCount: number;
};

function parseISODuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

export async function searchAndRank(
  apiKey: string,
  query: string,
  opts: { minSeconds?: number; maxSeconds?: number } = {},
): Promise<RankedVideo | null> {
  const minSeconds = opts.minSeconds ?? 120; // skip very short clips
  const maxSeconds = opts.maxSeconds ?? 5400; // skip multi-hour streams

  // Step 1: search.list (100 units)
  const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("maxResults", "10");
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
  if (ids.length === 0) return null;

  // Step 2: videos.list (1 unit) for duration + stats
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
    duration: parseISODuration(it.contentDetails?.duration ?? "PT0S"),
    viewCount: parseInt(it.statistics?.viewCount ?? "0", 10),
    likeCount: parseInt(it.statistics?.likeCount ?? "0", 10),
  }));

  const filtered = candidates.filter(
    (c) => c.duration >= minSeconds && c.duration <= maxSeconds,
  );
  const pool = filtered.length > 0 ? filtered : candidates;

  // Rank by a log-weighted blend of views + likes. Dislikes are no longer
  // exposed by the API, so we cannot use them.
  const score = (v: RankedVideo) =>
    Math.log10(v.viewCount + 1) * 2 + Math.log10(v.likeCount + 1);
  pool.sort((a, b) => score(b) - score(a));

  return pool[0] ?? null;
}
