import Groq from "groq-sdk";
import {
  CourseOutline,
  CourseOutlineSchema,
  GenerateRequest,
} from "@/types/course";

const SYSTEM_PROMPT = `You are an expert curriculum designer. Given a topic, skill level, and learner goal, produce a focused course outline.

Rules:
- Return STRICT JSON only, matching the schema exactly. No prose, no markdown.
- Maximum 5 modules. Each module has 1-4 lessons.
- Each lesson includes:
  - "title": a concise lesson name.
  - "description": a 1-3 sentence AI summary PLUS one concrete practice task.
  - "searchQuery": an effective YouTube search string to find a great tutorial for this lesson.
- Order modules and lessons from foundational to advanced.
- Keep searchQuery specific and likely to return high quality tutorials.

Schema: { "title": string, "modules": [ { "title": string, "lessons": [ { "title": string, "description": string, "searchQuery": string } ] } ] }`;

export async function generateCourseOutline(
  apiKey: string,
  req: GenerateRequest,
): Promise<CourseOutline> {
  const groq = new Groq({ apiKey });
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  const completion = await groq.chat.completions.create({
    model,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Topic: ${req.topic}\nLevel: ${req.level}\nGoal: ${req.goal}\n\nReturn the JSON course outline now.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Groq returned invalid JSON");
  }

  const result = CourseOutlineSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Groq output failed validation: " + result.error.message);
  }
  return result.data;
}
