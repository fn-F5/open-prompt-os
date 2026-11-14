import { Badge, Button } from "@open-prompt-os/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import { orpcClient } from "../lib/orpc.js";
import { queryKeys } from "../lib/query-client.js";

export function BillingReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const planParam = params.get("plan") ?? "pro";
  const isEmulated = params.get("emulated") === "1";
  const [syncedPlan, setSyncedPlan] = React.useState<string>(planParam);

  React.useEffect(() => {
    let active = true;
    orpcClient.billing
      .refresh()
      .then((status) => {
        if (!active) return;
        if (status.plan !== "free") {
          setSyncedPlan(status.plan);
        }
        queryClient.setQueryData(queryKeys.billing.status(), status);
        void queryClient.invalidateQueries({ queryKey: queryKeys.billing.status() });
      })
      .catch(() => {
        // Keep query-param fallback if refresh fails in offline mode
      });
    return () => {
      active = false;
    };
  }, [queryClient]);

  return (
    <section className="max-w-md mx-auto my-12 rounded-2xl p-6 flat-surface text-center space-y-4">
      <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--text-primary)]" />
      <div className="flex items-center justify-center gap-2">
        <Badge variant="framework">Subscription Reconciled</Badge>
        {isEmulated ? <Badge variant="neutral">Local Emulator</Badge> : null}
      </div>
      <h1 className="text-xl font-semibold">
        Welcome to Open Prompt OS {syncedPlan.toUpperCase()}
      </h1>
      <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
        Your workspace entitlements and daily limits have been updated.
      </p>
      <Button variant="primary-inverse" onClick={() => navigate("/")}>
        Return to Composer
      </Button>
    </section>
  );
}
