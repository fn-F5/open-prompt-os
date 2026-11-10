import { Badge, Button } from "@open-prompt-os/ui-web";
import { CheckCircle2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

export function BillingReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const plan = params.get("plan") ?? "pro";

  return (
    <section className="max-w-md mx-auto my-12 rounded-2xl p-6 flat-surface text-center space-y-4">
      <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--text-primary)]" />
      <Badge variant="framework">Subscription Reconciled</Badge>
      <h1 className="text-xl font-semibold">
        Welcome to Open Prompt OS {plan.toUpperCase()}
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
