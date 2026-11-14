import { afterEach, describe, expect, it, vi } from "vitest";
import { createCaptureMailer, createResendMailer } from "./mailer.js";

describe("createCaptureMailer", () => {
  it("captures and normalizes email keys in memory", async () => {
    const mailer = createCaptureMailer();
    await mailer.send({ email: "  User@Example.COM ", otp: "123456" });

    expect(mailer.take("user@example.com")).toBe("123456");
    expect(mailer.take("missing@example.com")).toBeUndefined();
  });
});

describe("createResendMailer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts sanitized OTP emails to Resend API", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));

    const mailer = createResendMailer({
      apiKey: "re_secret",
      from: "Custom <no-reply@example.com>",
      replyTo: "support@example.com",
    });

    await mailer.send({ email: "user@example.com", otp: "123-456\n" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init?.method).toBe("POST");
    const parsed = JSON.parse(String(init?.body));
    expect(parsed.from).toBe("Custom <no-reply@example.com>");
    expect(parsed.reply_to).toBe("support@example.com");
    expect(parsed.to).toEqual(["user@example.com"]);
    expect(parsed.subject).toBe("Your OpenPrompt OS code: 123-456");
    expect(parsed.text).toContain("123-456");
  });

  it("throws a safe error when Resend API returns a non-OK response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad key", { status: 403 }));

    const mailer = createResendMailer("re_bad");
    await expect(mailer.send({ email: "user@example.com", otp: "654321" })).rejects.toThrow(
      "Sign-in email could not be sent.",
    );
  });
});
