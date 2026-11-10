import { WifiOff } from "lucide-react";
import * as React from "react";
import { isStorageDegraded, onStorageDegradedChange } from "../../lib/storage.js";

export function StorageAndNetworkBanner() {
  const [degraded, setDegraded] = React.useState(() => isStorageDegraded());
  const [isOffline, setIsOffline] = React.useState(() =>
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );

  React.useEffect(() => {
    const unsub = onStorageDegradedChange(setDegraded);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }
    return () => {
      unsub();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, []);

  if (!degraded && !isOffline) return null;

  return (
    <div
      role="status"
      className="w-full bg-[var(--surface-2)] border-b border-[var(--separator-subtle)] px-4 py-2 text-xs text-[var(--text-secondary)]"
    >
      <div className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-2">
        {isOffline ? (
          <span className="inline-flex items-center gap-1.5 text-[var(--text-primary)] font-medium">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline mode — your current composer draft remains editable in this tab.</span>
          </span>
        ) : null}
        {degraded ? (
          <span>
            Browser storage is restricted (private mode). Your active session is preserved in
            memory, but refresh persistence is unavailable.
          </span>
        ) : null}
      </div>
    </div>
  );
}
