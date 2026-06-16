import Groq from "groq-sdk";
import {
  CourseOutline,
  CourseOutlineSchema,
  GenerateRequest,
} from "@/types/course";

const SYSTEM_PROMPT = `You are an expert curriculum designer who builds focused, non-repetitive video courses.

Given a topic, skill level, and learner goal, produce a course outline as STRICT JSON only (no prose, no markdown), matching the schema exactly.

Hard requirements:
- 4 to 6 modules. Each module has 2 to 5 lessons. Order everything foundational -> advanced.
- Every lesson must cover a DISTINCT sub-skill. Never restate the same concept in two lessons.
- Each lesson has:
  - "title": a concise, specific lesson name.
  - "description": a 1-3 sentence summary PLUS one concrete, lesson-specific practice task.
  - "searchQuery": a precise YouTube search string for THIS exact lesson.
- searchQuery rules (critical, this is how we avoid showing the same video twice):
  - Every searchQuery in the whole course MUST be unique.
  - Target the lesson's narrow sub-topic, not the broad subject. Include the distinguishing keywords (the exact technique, tool, or step) plus the overall topic for context.
  - Never use generic queries like "<topic> tutorial" that would all return the same popular video.

Schema: { "title": string, "modules": [ { "title": string, "lessons": [ { "title": string, "description": string, "searchQuery": string } ] } ] }`;

const REFINE_PROMPT = `You are reviewing a draft course outline for quality. Improve it and return STRICT JSON only, in the same schema.

Fix these problems if present:
- Lessons that overlap or repeat a concept: merge them or replace one with a genuinely different sub-topic.
- Vague or duplicated "searchQuery" values: rewrite so every query is unique and specifically targets that lesson's narrow sub-topic (distinguishing keywords + the topic).
- Weak structure: ensure a logical foundational -> advanced progression and that every lesson earns its place.

Keep 4-6 modules, each with 2-5 lessons. Return ONLY the improved JSON outline.`;

function getModel(): string {
  return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

async function completeJSON(
  groq: Groq,
  model: string,
  messages: { role: "system" | "user"; content: string }[],
  temperature: number,
): Promise<string> {
  const completion = await groq.chat.completions.create({
    model,
    temperature,
    max_tokens: 4000,
    response_format: { type: "json_object" },
    messages,
  });
  return completion.choices[0]?.message?.content ?? "{}";
}

// Final safety net: guarantee every searchQuery is unique even if the model slips.
function dedupeQueries(outline: CourseOutline): CourseOutline {
  const seen = new Set<string>();
  for (const m of outline.modules) {
    for (const l of m.lessons) {
      let q = l.searchQuery.trim();
      if (seen.has(q.toLowerCase())) {
        q = `${q} ${l.title}`.trim();
      }
      seen.add(q.toLowerCase());
      l.searchQuery = q;
    }
  }
  return outline;
}

export async function generateCourseOutline(
  apiKey: string,
  req: GenerateRequest,
): Promise<CourseOutline> {
  const groq = new Groq({ apiKey });
  const model = getModel();
  const userMsg = `Topic: ${req.topic}\nLevel: ${req.level}\nGoal: ${req.goal}\n\nReturn the JSON course outline now.`;

  // Pass 1: draft.
  const draftRaw = await completeJSON(
    groq,
    model,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
    0.4,
  );
  let draft: unknown;
  try {
    draft = JSON.parse(draftRaw);
  } catch {
    throw new Error("Groq returned invalid JSON");
  }
  const draftParsed = CourseOutlineSchema.safeParse(draft);

  // Pass 2: critique + refine (best-effort). Falls back to the draft on any issue.
  try {
    const refinedRaw = await completeJSON(
      groq,
      model,
      [
        { role: "system", content: REFINE_PROMPT },
        {
          role: "user",
          content: `Topic: ${req.topic}\nLevel: ${req.level}\nGoal: ${req.goal}\n\nDraft outline:\n${draftRaw}\n\nReturn the improved JSON now.`,
        },
      ],
      0.3,
    );
    const refinedParsed = CourseOutlineSchema.safeParse(JSON.parse(refinedRaw));
    if (refinedParsed.success) return dedupeQueries(refinedParsed.data);
  } catch {
    // ignore and use the draft
  }

  if (draftParsed.success) return dedupeQueries(draftParsed.data);
  throw new Error("Groq output failed validation: " + draftParsed.error.message);
}

export type VideoCandidate = {
  title: string;
  channelName: string;
  description: string;
  duration: number;
};

/**
 * Ask the model to pick the candidate video that best teaches a lesson, judging
 * by each candidate's title + description (a reliable proxy for what the video
 * actually covers). Returns the chosen index, or -1 to let the caller fall back
 * to algorithmic ranking.
 */
export async function pickBestVideoIndex(
  apiKey: string,
  lesson: { title: string; description: string; topic: string },
  candidates: VideoCandidate[],
): Promise<number> {
  if (candidates.length === 0) return -1;
  const groq = new Groq({ apiKey });
  const model = getModel();
  const list = candidates
    .map(
      (c, i) =>
        `[${i}] "${c.title}" - ${c.channelName} (${Math.round(c.duration / 60)} min)\n    ${c.description.slice(0, 280).replace(/\s+/g, " ")}`,
    )
    .join("\n");
  const sys = `You match a YouTube video to a course lesson. Choose the single candidate that best TEACHES this lesson's specific skill: it MUST be an instructional / educational / tutorial / how-to / explainer video that a learner would genuinely learn the skill from. REJECT (never choose) entertainment, comedy, novelty or "funny"/"amazing"/viral clips, news reports, reactions, compilations, music videos, vlogs, trailers, or any video that merely MENTIONS the keywords without actually teaching them. A clip that matches the lesson keywords but is not genuinely instructional is NOT relevant. Judge from each candidate's title and description. Return STRICT JSON only: {"index": <number>}. If none are genuinely instructional and on-topic, return {"index": -1}.`;
  const user = `Course topic: ${lesson.topic}\nLesson: ${lesson.title}\nWhat it should teach: ${lesson.description}\n\nCandidates:\n${list}\n\nReturn the JSON now.`;
  try {
    const raw = await completeJSON(
      groq,
      model,
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      0.1,
    );
    const idx = Number((JSON.parse(raw) as { index?: unknown }).index);
    if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return idx;
  } catch {
    // ignore
  }
  return -1;
}

export type VideoCandidateWithComments = VideoCandidate & {
  comments: string[];
};

/**
 * Like pickBestVideoIndex, but also feeds each candidate's top viewer comments
 * to the model so it can judge real-world quality and course alignment (did
 * viewers actually learn from it? is it accurate / on-topic / not novelty?).
 * Returns the chosen index, or -1 to fall back to algorithmic ranking.
 */
export async function pickBestVideoWithComments(
  apiKey: string,
  lesson: { title: string; description: string; topic: string },
  candidates: VideoCandidateWithComments[],
): Promise<number> {
  if (candidates.length === 0) return -1;
  const groq = new Groq({ apiKey });
  const model = getModel();
  const list = candidates
    .map((c, i) => {
      const comments =
        c.comments.length > 0
          ? c.comments
              .slice(0, 80)
              .map((t) => `      - ${t.replace(/\s+/g, " ").slice(0, 200)}`)
              .join("\n")
          : "      (comments unavailable)";
      return `[${i}] "${c.title}" - ${c.channelName} (${Math.round(
        c.duration / 60,
      )} min)\n    Description: ${c.description.slice(0, 280).replace(/\s+/g, " ")}\n    Top viewer comments:\n${comments}`;
    })
    .join("\n\n");
  const sys = `You pick the YouTube video that best TEACHES a course lesson, using its title, description, AND what real viewers say in the comments. The chosen video MUST be genuinely instructional/educational for this lesson's specific skill. Use the comments as evidence of quality and alignment: PREFER videos whose commenters indicate it was clear, accurate, and helped them actually learn the topic; REJECT videos whose comments suggest it is entertainment/novelty/off-topic, inaccurate, misleading, outdated, low quality, or that viewers found unhelpful for learning. Return STRICT JSON only: {"index": <number>}. If none are genuinely instructional and well-reviewed for this lesson, return {"index": -1}.`;
  const user = `Course topic: ${lesson.topic}\nLesson: ${lesson.title}\nWhat it should teach: ${lesson.description}\n\nCandidates:\n${list}\n\nReturn the JSON now.`;
  try {
    const raw = await completeJSON(
      groq,
      model,
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      0.1,
    );
    const idx = Number((JSON.parse(raw) as { index?: unknown }).index);
    if (Number.isInteger(idx) && idx >= 0 && idx < candidates.length) return idx;
  } catch {
    // ignore
  }
  return -1;
}
