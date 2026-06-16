// Email client using SMTP (works with Gmail, SendGrid, Brevo, Mailgun, etc.).
// Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM in your env.
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<your gmail>,
// SMTP_PASS=<16-char App Password>, EMAIL_FROM="Tubinator <your gmail>".

import nodemailer, { type Transporter } from "nodemailer";

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
};

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

export function isEmailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // true for 465 (SSL), false for 587 (STARTTLS)
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Email is not configured (SMTP_USER/SMTP_PASS missing)");
  }
  const from = process.env.EMAIL_FROM || `Tubinator <${SMTP_USER}>`;
  await getTransporter().sendMail({ from, to, subject, html });
}

/** Branded HTML wrapper for a one-time code email. */
export function otpEmailHtml(
  code: string,
  purpose: "verify" | "login" | "reset",
): string {
  const heading =
    purpose === "verify"
      ? "Verify your email"
      : purpose === "reset"
        ? "Reset your password"
        : "Your login code";
  const intro =
    purpose === "verify"
      ? "Welcome to Tubinator! Use the code below to verify your email and finish creating your account."
      : purpose === "reset"
        ? "Use the code below to reset your Tubinator password. If you didn't request this, you can safely ignore this email."
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
