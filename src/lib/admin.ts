// Admin access is decided by an email allowlist in the ADMIN_EMAILS env var
// (comma-separated). Example: ADMIN_EMAILS=you@example.com,co@example.com

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
