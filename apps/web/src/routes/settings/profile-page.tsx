import { Badge } from "@open-prompt-os/ui-web";
import { useAuthSession } from "../../hooks/use-auth-session.js";

export function ProfileSettingsPage() {
  const { user } = useAuthSession();

  return (
    <section className="rounded-xl p-6 flat-surface space-y-4">
      <div>
        <Badge variant="framework">Workspace Identity</Badge>
        <h1 className="mt-2 text-xl font-semibold">Profile & Workspace</h1>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm pt-2">
        <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
          <dt className="text-xs text-[var(--text-secondary)]">Operator Name</dt>
          <dd className="font-medium mt-1">{user?.name ?? "Operator"}</dd>
        </div>
        <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
          <dt className="text-xs text-[var(--text-secondary)]">Email</dt>
          <dd className="font-medium mt-1">{user?.email ?? "—"}</dd>
        </div>
        <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
          <dt className="text-xs text-[var(--text-secondary)]">Active Space</dt>
          <dd className="font-medium mt-1">{user?.spaceName ?? "Default Space"}</dd>
        </div>
        <div className="p-3.5 rounded-lg bg-[var(--surface-2)]">
          <dt className="text-xs text-[var(--text-secondary)]">Plan Tier</dt>
          <dd className="font-medium mt-1 uppercase">{user?.plan ?? "free"}</dd>
        </div>
      </dl>
    </section>
  );
}
