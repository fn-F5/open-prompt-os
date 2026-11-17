import type { FeedbackKind } from "@open-prompt-os/contracts";

export interface FeedbackMail {
  readonly id: string;
  readonly kind: FeedbackKind;
  readonly title: string | null;
  readonly message: string;
  readonly contactEmail: string | null;
  readonly userEmail?: string | null;
  readonly userName?: string | null;
  readonly userId?: string;
  readonly spaceId?: string;
  readonly pagePath: string | null;
  readonly createdAt: string;
}

export interface FeedbackMailer {
  send(mail: FeedbackMail): Promise<void>;
}

const KIND_LABELS: Record<FeedbackKind, string> = {
  feature_request: "Feature Request",
  general_feedback: "General Feedback",
  bug_report: "Bug Report",
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export interface ResendFeedbackMailerOptions {
  readonly apiKey: string;
  readonly from: string;
  readonly to: string;
}

export function createResendFeedbackMailer(options: ResendFeedbackMailerOptions): FeedbackMailer {
  return {
    async send(mail) {
      const kindLabel = KIND_LABELS[mail.kind];
      const subjectDetail =
        mail.title?.trim() || mail.message.trim().replace(/\s+/g, " ").slice(0, 60);
      const subject = `[OpenPrompt OS · ${kindLabel}] ${subjectDetail}`;
      const replyTo = mail.contactEmail || mail.userEmail || undefined;

      const submitter = mail.userEmail
        ? `${mail.userName ? `${mail.userName} ` : ""}<${mail.userEmail}> (userId: ${mail.userId ?? "—"})`
        : mail.contactEmail
          ? `Guest <${mail.contactEmail}>`
          : "Anonymous Guest";

      const textLines = [
        `Type: ${kindLabel}`,
        `Submitted by: ${submitter}`,
        mail.spaceId ? `Space ID: ${mail.spaceId}` : null,
        mail.pagePath ? `Page: ${mail.pagePath}` : null,
        `Feedback ID: ${mail.id}`,
        `Submitted at: ${mail.createdAt}`,
        mail.title ? `Summary: ${mail.title}` : null,
        "",
        "Message:",
        mail.message,
      ].filter((line): line is string => line !== null);

      const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
  <p style="margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;color:#ea580c;font-weight:600;">${escapeHtml(kindLabel)}</p>
  <h2 style="margin:0 0 16px;font-size:20px;">${escapeHtml(mail.title ?? `New ${kindLabel}`)}</h2>
  <div style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;white-space:pre-wrap;font-size:14px;line-height:1.55;">${escapeHtml(mail.message)}</div>
  <table style="margin-top:18px;font-size:13px;color:#4b5563;border-collapse:collapse;">
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Submitted by:</td><td>${escapeHtml(submitter)}</td></tr>
    ${mail.pagePath ? `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Page:</td><td>${escapeHtml(mail.pagePath)}</td></tr>` : ""}
    ${mail.spaceId ? `<tr><td style="padding:4px 12px 4px 0;font-weight:600;">Space ID:</td><td>${escapeHtml(mail.spaceId)}</td></tr>` : ""}
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Feedback ID:</td><td><code>${escapeHtml(mail.id)}</code></td></tr>
    <tr><td style="padding:4px 12px 4px 0;font-weight:600;">Timestamp:</td><td>${escapeHtml(mail.createdAt)}</td></tr>
  </table>
</div>`;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [options.to],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject,
          text: textLines.join("\n"),
          html,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Resend feedback email failed (${response.status}): ${body}`);
      }
    },
  };
}

export function createDefaultFeedbackMailer(
  env: Record<string, string | undefined> = process.env,
): FeedbackMailer {
  const nodeEnv = env.NODE_ENV ?? "development";
  if (nodeEnv === "test") {
    return { async send() {} };
  }

  const apiKey = env.RESEND_API_KEY?.trim();
  const mailProvider = env.MAIL_PROVIDER?.trim().toLowerCase();
  const from = env.MAIL_FROM?.trim() || "OpenPrompt OS <login@mail.openpromptos.com>";
  const to = env.FEEDBACK_TO_EMAIL?.trim() || env.MAIL_REPLY_TO?.trim() || "hello@openpromptos.com";

  if ((nodeEnv === "production" || mailProvider === "resend") && apiKey) {
    return createResendFeedbackMailer({ apiKey, from, to });
  }

  return {
    async send(mail) {
      if (nodeEnv === "development") {
        console.log(
          `[feedback] ${KIND_LABELS[mail.kind]} (${mail.id}) -> ${to}: ${mail.title ?? mail.message.slice(0, 80)}`,
        );
      }
    },
  };
}
