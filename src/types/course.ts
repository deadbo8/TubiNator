import { z } from "zod";

export const LessonSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  searchQuery: z.string().min(1),
});

export const ModuleSchema = z.object({
  title: z.string().min(1),
  lessons: z.array(LessonSchema).min(1).max(4),
});

export const CourseOutlineSchema = z.object({
  title: z.string().min(1),
  modules: z.array(ModuleSchema).min(1).max(5),
});

export type CourseOutline = z.infer<typeof CourseOutlineSchema>;

export const GenerateRequestSchema = z.object({
  topic: z.string().min(2).max(120),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  goal: z.string().min(2).max(200),
});

export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
