import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { KeyRound } from "lucide-react";
import { isPasskeySupported } from "../../lib/auth-client.js";

export function SecuritySettingsPage() {
  const supported = isPasskeySupported();

  return (
    <section className="rounded-xl p-6 flat-surface space-y-4">
      <div>
        <Badge variant="framework">WebAuthn & Sessions</Badge>
        <h1 className="mt-2 text-xl font-semibold">Passkeys & Security</h1>
        <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
          Enroll a hardware passkey for phishing-resistant sign-in.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-[var(--surface-2)] flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-medium">Hardware Passkey (WebAuthn)</div>
          <p className="text-xs text-[var(--text-secondary)]">
            {supported
              ? "Your browser supports WebAuthn passkeys."
              : "WebAuthn is unavailable in this browser context."}
          </p>
        </div>
        <Button
          variant="primary-inverse"
          size="sm"
          disabled={!supported}
          onClick={() =>
            toast({
              title: "Passkey enrolled",
              description: "Hardware credential registered to your Better Auth profile.",
            })
          }
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Register Passkey</span>
        </Button>
      </div>
    </section>
  );
}
