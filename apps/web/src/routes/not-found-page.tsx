import { Badge, Button } from "@open-prompt-os/ui-web";
import { useNavigate } from "react-router";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section className="max-w-md mx-auto my-12 rounded-2xl p-8 flat-surface text-center space-y-4">
      <Badge variant="neutral">404 · Route Not Found</Badge>
      <h1 className="text-2xl font-semibold">This route does not exist</h1>
      <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
        Your composer draft is preserved. Return to the main workspace to continue compiling.
      </p>
      <Button variant="primary-inverse" onClick={() => navigate("/")}>
        Return to Composer
      </Button>
    </section>
  );
}
