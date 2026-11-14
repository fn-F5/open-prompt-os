import { afterEach, describe, expect, it, vi } from "vitest";
import { createCaptureMailer, createResendMailer } from "./mailer.js";

describe("auth mailers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("captures and retrieves normalized OTP codes by email", async () => {
    const mailer = createCaptureMailer();
    await mailer.send({ email: "  Ada@Example.COM ", otp: "654321" });
    expect(mailer.take("ada@example.com")).toBe("654321");
    expect(mailer.take("  ADA@EXAMPLE.COM ")).toBe("654321");
    expect(mailer.take("nobody@example.com")).toBeUndefined();
  });

  it("sends sanitized OTP email via Resend with defaults and custom headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const mailer = createResendMailer("re_secret_key");
    await mailer.send({ email: "ada@example.com", otp: "123-456!<script>" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      authorization: "Bearer re_secret_key",
      "content-type": "application/json",
    });

    const payload = JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      reply_to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(payload.from).toBe("OpenPrompt OS <login@mail.openpromptos.com>");
    expect(payload.reply_to).toBe("hello@openpromptos.com");
    expect(payload.to).toEqual(["ada@example.com"]);
    expect(payload.subject).toBe("Your OpenPrompt OS code: 123-456script");
    expect(payload.text).toContain("123-456script");
    expect(payload.html).toContain("123-456script");
    expect(payload.html).not.toContain("<script>");
  });

  it("uses custom from/replyTo and throws a safe error when Resend fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad key", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mailer = createResendMailer({
      apiKey: "re_bad",
      from: "Custom <login@custom.dev>",
      replyTo: "help@custom.dev",
    });

    await expect(mailer.send({ email: "ada@example.com", otp: "123456" })).rejects.toThrow(
      "Sign-in email could not be sent.",
    );

    const payload = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      from: string;
      reply_to: string;
    };
    expect(payload.from).toBe("Custom <login@custom.dev>");
    expect(payload.reply_to).toBe("help@custom.dev");
    expect(errorSpy).toHaveBeenCalledWith("Resend email send failed (401): bad key");
  });

  it("handles unreadable error bodies gracefully when Resend fails", async () => {
    const failingResponse = {
      ok: false,
      status: 500,
      text: vi.fn().mockRejectedValue(new Error("stream closed")),
    } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failingResponse));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mailer = createResendMailer("re_bad");
    await expect(mailer.send({ email: "ada@example.com", otp: "123456" })).rejects.toThrow(
      "Sign-in email could not be sent.",
    );
    expect(errorSpy).toHaveBeenCalledWith("Resend email send failed (500): ");
  });
});
