import { Badge, Button } from "@open-prompt-os/ui-web";
import { useNavigate } from "react-router";
import { SeoHead } from "../components/seo/seo-head.js";
import { useCardHoverAnimation } from "../hooks/use-card-parallax.js";

export function NotFoundPage() {
  const navigate = useNavigate();
  const animateCard = useCardHoverAnimation();

  return (
    <section
      data-animate={animateCard("notFoundCard")}
      className="max-w-md mx-auto my-12 rounded-2xl p-8 flat-surface text-center space-y-4"
    >
      <SeoHead
        meta={{
          title: "Page Not Found (404) | Open Prompt OS",
          description: "The requested page could not be found on Open Prompt OS.",
          canonicalPath: "/404",
          noindex: true,
        }}
      />
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
