// Minimal Resend email client (no SDK dependency — uses the REST API directly).
// Configure with RESEND_API_KEY and EMAIL_FROM in your environment.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
};

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Tubinator <onboarding@resend.dev>";
  if (!apiKey) {
    throw new Error("Email is not configured (RESEND_API_KEY missing)");
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${detail}`);
  }
}

/** Branded HTML wrapper for a one-time code email. */
export function otpEmailHtml(code: string, purpose: "verify" | "login"): string {
  const heading =
    purpose === "verify" ? "Verify your email" : "Your login code";
  const intro =
    purpose === "verify"
      ? "Welcome to Tubinator! Use the code below to verify your email and finish creating your account."
      : "Use the code below to sign in to Tubinator.";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0a0a0b;font-family:Inter,Arial,sans-serif;color:#e7e7ea;padding:40px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background:#141417;border:1px solid #26262b;border-radius:18px;padding:36px;">
          <tr><td>
            <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#8b5cf6;font-weight:700;">Tubinator</div>
            <h1 style="margin:14px 0 8px;font-size:24px;color:#fff;">${heading}</h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa;">${intro}</p>
            <div style="font-size:38px;font-weight:800;letter-spacing:10px;color:#fff;background:#1c1c20;border:1px solid #2e2e35;border-radius:12px;padding:18px;text-align:center;">${code}</div>
            <p style="margin:24px 0 0;font-size:12px;color:#71717a;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
