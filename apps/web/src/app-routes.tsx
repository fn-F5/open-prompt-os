import { Button } from "@open-prompt-os/ui-web";
import * as React from "react";
import { Navigate, Route, Routes } from "react-router";
import { HybridLayout } from "./layouts/hybrid-layout.js";
import { SettingsLayout } from "./layouts/settings-layout.js";
import { ComposerPage } from "./routes/composer-page.js";
import { NotFoundPage } from "./routes/not-found-page.js";

const ImproveAutopsyPage = React.lazy(() =>
  import("./routes/improve-autopsy-page.js").then((m) => ({ default: m.ImproveAutopsyPage })),
);
const ReverseEngineerPage = React.lazy(() =>
  import("./routes/reverse-engineer-page.js").then((m) => ({ default: m.ReverseEngineerPage })),
);
const TemplateGalleryPage = React.lazy(() =>
  import("./routes/template-gallery-page.js").then((m) => ({ default: m.TemplateGalleryPage })),
);
const TemplateDetailPage = React.lazy(() =>
  import("./routes/template-detail-page.js").then((m) => ({ default: m.TemplateDetailPage })),
);
const LibraryPage = React.lazy(() =>
  import("./routes/library-page.js").then((m) => ({ default: m.LibraryPage })),
);
const HistoryPage = React.lazy(() =>
  import("./routes/history-page.js").then((m) => ({ default: m.HistoryPage })),
);
const PublicPromptPage = React.lazy(() =>
  import("./routes/public-prompt-page.js").then((m) => ({ default: m.PublicPromptPage })),
);
const PricingPage = React.lazy(() =>
  import("./routes/pricing-page.js").then((m) => ({ default: m.PricingPage })),
);
const BillingReturnPage = React.lazy(() =>
  import("./routes/billing-return-page.js").then((m) => ({ default: m.BillingReturnPage })),
);
const ProfileSettingsPage = React.lazy(() =>
  import("./routes/settings/profile-page.js").then((m) => ({ default: m.ProfileSettingsPage })),
);

class RouteErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Failed to load application route.",
    };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-xl p-6 bg-[var(--danger-bg)] text-[var(--danger-text)] border border-[var(--danger-text)]/40 space-y-3 my-8"
        >
          <h2 className="text-base font-semibold">Route failed to load</h2>
          <p className="text-xs">{this.state.message}</p>
          <Button
            variant="primary-inverse"
            size="sm"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Retry route
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SuspenseFallback() {
  return (
    <div
      aria-busy="true"
      className="rounded-2xl p-8 bg-[var(--surface-1)] border border-[var(--separator-subtle)] h-64 animate-pulse"
    />
  );
}

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <React.Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route element={<HybridLayout />}>
            <Route index element={<ComposerPage />} />
            <Route path="improve" element={<ImproveAutopsyPage />} />
            <Route path="reverse-engineer" element={<ReverseEngineerPage />} />
            <Route path="templates" element={<TemplateGalleryPage />} />
            <Route path="templates/:templateSlug" element={<TemplateDetailPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="share/:shareId" element={<PublicPromptPage />} />
            <Route path="pricing" element={<PricingPage />} />
            <Route path="billing/return" element={<BillingReturnPage />} />
            <Route path="settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/profile" replace />} />
              <Route path="profile" element={<ProfileSettingsPage />} />
              <Route path="security" element={<Navigate to="/settings/profile" replace />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </React.Suspense>
    </RouteErrorBoundary>
  );
}
