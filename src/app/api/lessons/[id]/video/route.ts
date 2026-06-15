import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveKey } from "@/lib/keys";
import { searchAndRank } from "@/lib/youtube";

// Lazy video fetch: only hits the YouTube API the first time a lesson is opened,
// then caches the result in the Video table (shared across all lessons/courses).
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lesson = await prisma.lesson.findUnique({
    where: { id: params.id },
    include: { video: true },
  });
  if (!lesson)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (lesson.video)
    return NextResponse.json({ video: lesson.video, cached: true });

  const ytKey = await resolveKey(userId, "youtube");
  if (!ytKey)
    return NextResponse.json(
      { error: "No YouTube API key configured" },
      { status: 400 },
    );

  let ranked;
  try {
    ranked = await searchAndRank(ytKey.key, lesson.youtubeQuery);
  } catch (e) {
    const message = e instanceof Error ? e.message : "YouTube lookup failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  if (!ranked)
    return NextResponse.json(
      { error: "No suitable video found" },
      { status: 404 },
    );

  const video = await prisma.video.upsert({
    where: { youtubeId: ranked.youtubeId },
    update: {
      title: ranked.title,
      channelName: ranked.channelName,
      duration: ranked.duration,
      viewCount: ranked.viewCount,
      likeCount: ranked.likeCount,
    },
    create: {
      youtubeId: ranked.youtubeId,
      title: ranked.title,
      channelName: ranked.channelName,
      duration: ranked.duration,
      viewCount: ranked.viewCount,
      likeCount: ranked.likeCount,
    },
  });

  await prisma.lesson.update({
    where: { id: lesson.id },
    data: { videoId: video.id },
  });

  return NextResponse.json({ video, cached: false });
}
