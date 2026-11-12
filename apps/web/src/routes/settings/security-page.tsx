import { Badge, Button, toast } from "@open-prompt-os/ui-web";
import { KeyRound, Trash2 } from "lucide-react";
import * as React from "react";
import { useAuthSession } from "../../hooks/use-auth-session.js";
import { isPasskeySupported } from "../../lib/auth-client.js";

export function SecuritySettingsPage() {
  const supported = isPasskeySupported();
  const { isAuthenticated, registerPasskey, listPasskeys, deletePasskey } = useAuthSession();
  const [passkeys, setPasskeys] = React.useState<
    Array<{ id: string; name: string; createdAt: string | null }>
  >([]);
  const [pending, setPending] = React.useState(false);

  const refresh = React.useCallback(async () => {
    if (!isAuthenticated) {
      setPasskeys([]);
      return;
    }
    setPasskeys(await listPasskeys());
  }, [isAuthenticated, listPasskeys]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const enroll = async () => {
    setPending(true);
    try {
      await registerPasskey();
      await refresh();
      toast({
        title: "Passkey enrolled",
        description: "This device can sign in on the next visit.",
      });
    } catch (error) {
      toast({
        title: "Passkey was not enrolled",
        description: error instanceof Error ? error.message : "Registration failed.",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  };

  const remove = async (id: string) => {
    setPending(true);
    try {
      await deletePasskey(id);
      await refresh();
      toast({
        title: "Passkey removed",
        description: "This passkey can no longer be used to sign in.",
      });
    } catch (error) {
      toast({
        title: "Could not remove passkey",
        description: error instanceof Error ? error.message : "Removal failed.",
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  };

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
          disabled={!supported || !isAuthenticated || pending}
          onClick={() => void enroll()}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{pending ? "Waiting..." : "Register Passkey"}</span>
        </Button>
      </div>

      {passkeys.length > 0 ? (
        <ul className="space-y-2 text-sm">
          {passkeys.map((item) => (
            <li
              key={item.id}
              className="rounded-lg bg-[var(--surface-2)] px-3 py-2 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium">{item.name}</div>
                {item.createdAt ? (
                  <div className="text-xs text-[var(--text-secondary)]">
                    Added {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => void remove(item.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
