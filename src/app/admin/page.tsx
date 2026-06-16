"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AdminUser = {
  id: string;
  name: string | null;
  email: string | null;
  telegramId: string | null;
  emailVerified: boolean;
  banned: boolean;
  dailyGenCount: number;
  dailyGenLimit: number | null;
  createdAt: string;
  isAdmin: boolean;
  _count: { courses: number; enrollments: number };
};

type AdminCourse = {
  id: string;
  title: string;
  topic: string;
  level: string;
  isPublic: boolean;
  isAuthor: boolean;
  total: number;
  done: number;
  enrolledCount: number;
  createdAt: string;
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [q, setQ] = useState("");
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [courses, setCourses] = useState<Record<string, AdminCourse[]>>({});
  const [coursesLoading, setCoursesLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.status === 403) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUsers(data.users || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  }

  async function remove(id: string, email: string | null) {
    if (!confirm(`Delete ${email || "this user"} permanently? This cannot be undone.`))
      return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    load();
  }

  async function loadCourses(id: string) {
    setCoursesLoading(true);
    const res = await fetch(`/api/admin/users/${id}/courses`);
    const data = await res.json().catch(() => ({ courses: [] }));
    setCourses((c) => ({ ...c, [id]: data.courses || [] }));
    setCoursesLoading(false);
  }

  function toggleCourses(id: string) {
    if (openUser === id) {
      setOpenUser(null);
      return;
    }
    setOpenUser(id);
    if (!courses[id]) loadCourses(id);
  }

  async function removeCourse(userId: string, courseId: string, title: string) {
    if (
      !confirm(`Delete "${title}" permanently? This removes it for everyone.`)
    )
      return;
    await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    await loadCourses(userId);
    load();
  }

  if (loading)
    return <main className="p-10 text-center text-white/50">Loading...</main>;

  if (forbidden)
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Admins only</h1>
        <p className="mt-2 text-white/50">
          Your account doesn&apos;t have admin access.
        </p>
        <Link href="/dashboard" className="mt-4 inline-block text-[hsl(var(--primary))] hover:underline">
          Back to dashboard
        </Link>
      </main>
    );

  const filtered = users.filter(
    (u) =>
      !q ||
      u.email?.toLowerCase().includes(q.toLowerCase()) ||
      u.name?.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-bold">Admin · Users</h1>
      <p className="text-white/50">
        {users.length} total · manage limits, bans, and accounts.
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by email or name..."
        className="mt-5 h-10 w-full max-w-sm rounded-xl border border-white/15 bg-white/5 px-4 text-sm outline-none placeholder:text-white/40 focus:border-white/40"
      />

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/40">
            <tr>
              <th className="p-3">User</th>
              <th className="p-3">Status</th>
              <th className="p-3">Courses</th>
              <th className="p-3">Today</th>
              <th className="p-3">Daily limit</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <Fragment key={u.id}>
              <tr className="border-b border-white/5">
                <td className="p-3">
                  <div className="font-medium">{u.name || "—"}</div>
                  <div className="text-white/40">{u.email || "(no email)"}</div>
                  {u.telegramId && (
                    <div className="text-xs text-white/30">TG: {u.telegramId}</div>
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-col gap-1">
                    {u.isAdmin && (
                      <span className="text-[hsl(var(--primary))]">Admin</span>
                    )}
                    <span className={u.emailVerified ? "text-green-400" : "text-yellow-400"}>
                      {u.emailVerified ? "Verified" : "Unverified"}
                    </span>
                    {u.banned && <span className="text-red-400">Banned</span>}
                  </div>
                </td>
                <td className="p-3 text-white/70">{u._count.courses}</td>
                <td className="p-3 text-white/70">{u.dailyGenCount}</td>
                <td className="p-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={u.dailyGenLimit ?? ""}
                    placeholder="default"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      patch(u.id, {
                        dailyGenLimit: v === "" ? null : parseInt(v, 10),
                      });
                    }}
                    className="h-9 w-24 rounded-lg border border-white/15 bg-black/30 px-2 text-sm outline-none focus:border-white/40"
                  />
                </td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={openUser === u.id ? "primary" : "outline"}
                      onClick={() => toggleCourses(u.id)}
                    >
                      Courses
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patch(u.id, { banned: !u.banned })}
                    >
                      {u.banned ? "Unban" : "Ban"}
                    </Button>
                    <button
                      onClick={() => remove(u.id, u.email)}
                      className="rounded-xl border border-red-500/30 px-3 text-sm text-red-400 transition hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
              {openUser === u.id && (
                <tr className="border-b border-white/10 bg-black/20">
                  <td colSpan={6} className="p-3">
                    {coursesLoading && !courses[u.id] ? (
                      <p className="text-white/50">Loading courses...</p>
                    ) : (courses[u.id]?.length ?? 0) === 0 ? (
                      <p className="text-white/40">No courses.</p>
                    ) : (
                      <div className="space-y-2">
                        {(courses[u.id] || []).map((c) => (
                          <div
                            key={c.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {c.title}
                              </div>
                              <div className="text-xs text-white/40">
                                {c.level} · {c.topic} · {c.done}/{c.total} done
                                {c.isAuthor ? " · author" : " · enrolled"}
                                {c.isPublic ? " · public" : ""}
                              </div>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Link href={`/courses/${c.id}`} target="_blank">
                                <Button size="sm" variant="outline">
                                  View
                                </Button>
                              </Link>
                              <button
                                onClick={() =>
                                  removeCourse(u.id, c.id, c.title)
                                }
                                className="rounded-xl border border-red-500/30 px-3 text-sm text-red-400 transition hover:bg-red-500/10"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
