export interface SignInMail {
  readonly email: string;
  readonly otp: string;
}

export interface SignInMailer {
  send(mail: SignInMail): Promise<void>;
}

export interface ResendMailerOptions {
  readonly apiKey: string;
  readonly from?: string;
  readonly replyTo?: string;
}

export function createCaptureMailer(): SignInMailer & {
  take(email: string): string | undefined;
} {
  const codes = new Map<string, string>();
  return {
    async send(mail) {
      codes.set(mail.email.trim().toLowerCase(), mail.otp);
    },
    take(email) {
      return codes.get(email.trim().toLowerCase());
    },
  };
}

export function createResendMailer(options: string | ResendMailerOptions): SignInMailer {
  const config: ResendMailerOptions = typeof options === "string" ? { apiKey: options } : options;
  const from = config.from ?? "OpenPrompt OS <login@mail.openpromptos.com>";
  const replyTo = config.replyTo ?? "hello@openpromptos.com";

  return {
    async send(mail) {
      const safeOtp = mail.otp.replace(/[^0-9A-Za-z-]/g, "");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [mail.email],
          reply_to: replyTo,
          subject: `Your OpenPrompt OS code: ${safeOtp}`,
          text: `Your OpenPrompt OS sign-in code is ${safeOtp}. It expires in 10 minutes.`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px;font-size:18px;">OpenPrompt OS sign-in code</h2>
  <p style="margin:0 0 16px;color:#444;">Use the 6-digit code below to sign in. It expires in 10 minutes.</p>
  <div style="font-size:28px;font-weight:700;letter-spacing:6px;padding:14px 18px;background:#f4f4f5;border-radius:8px;display:inline-block;">${safeOtp}</div>
  <p style="margin:20px 0 0;font-size:12px;color:#71717a;">If you did not request this code, you can safely ignore this email.</p>
</div>`,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`Resend email send failed (${response.status}): ${body}`);
        throw new Error("Sign-in email could not be sent.");
      }
    },
  };
}
