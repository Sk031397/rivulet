import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = process.env.RESEND_FROM ?? "Rivulet <onboarding@resend.dev>";

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

/**
 * Fire-and-forget transactional email. No-op when RESEND_API_KEY is unset, and
 * never throws — email failures must never block money movement.
 */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  if (!resend) return;
  try {
    await resend.emails.send({ from: FROM, to: opts.to, subject: opts.subject, html: opts.html });
  } catch (err) {
    console.error("[email] send failed:", err);
  }
}

/** Branded "you received money" receipt for a Send payout (email recipients only). */
export async function sendPaymentReceivedEmail(opts: {
  to: string;
  amount: number;
  note?: string;
}): Promise<void> {
  const noteHtml = opts.note
    ? `<tr><td style="padding:16px;background:#ffffff;border-radius:12px;font-size:14px;color:#555555;">&ldquo;${escapeHtml(opts.note)}&rdquo;</td></tr><tr><td style="height:16px;"></td></tr>`
    : "";
  await sendEmail({
    to: opts.to,
    subject: `You received $${opts.amount.toFixed(2)} on Rivulet`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f5f1;font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 8px;">
<p style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#4f46e5;margin:0 0 8px;">Rivulet</p>
<h1 style="font-size:24px;font-weight:800;margin:0 0 8px;color:#1a1a1a;">You received money</h1>
<p style="font-size:16px;color:#555555;margin:0 0 24px;">Someone just sent you <strong style="color:#1a1a1a;">$${opts.amount.toFixed(2)}</strong> through Rivulet.</p>
${noteHtml}
<p style="font-size:14px;color:#555555;margin:0 0 8px;">It's on its way via PayPal. If a PayPal account is linked to this email, it lands there automatically — otherwise PayPal will email you a link to claim it.</p>
<p style="font-size:14px;color:#888888;margin:32px 0 0;">Sent with Rivulet — let money find its way.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  });
}

/** Branded "you're invited" email with a join link. */
export async function sendInviteEmail(opts: { to: string; inviteLink: string }): Promise<void> {
  await sendEmail({
    to: opts.to,
    subject: "You're invited to Rivulet",
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f6f5f1;font-family:ui-sans-serif,system-ui,Arial,sans-serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;">
<tr><td style="padding:0 8px;">
<p style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#4f46e5;margin:0 0 8px;">Rivulet</p>
<h1 style="font-size:24px;font-weight:800;margin:0 0 8px;color:#1a1a1a;">You're invited to Rivulet</h1>
<p style="font-size:16px;color:#555555;margin:0 0 24px;">A simpler way to collect, split, and pay out money — describe a flow in plain English and the AI builds it for you.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
<tr><td style="background:#1a1a1a;border-radius:999px;"><a href="${escapeHtml(opts.inviteLink)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">Join Rivulet</a></td></tr>
</table>
<p style="font-size:14px;color:#888888;margin:0;">Sent with Rivulet — let money find its way.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`,
  });
}
