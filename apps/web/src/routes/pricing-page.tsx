import * as React from "react";
import { PricingPlansSection } from "../components/pricing/pricing-plans-section.js";
import { SeoHead } from "../components/seo/seo-head.js";
import { buildPricingSeo } from "../lib/seo.js";

export function PricingPage() {
  const seoMeta = React.useMemo(() => buildPricingSeo(), []);
  return (
    <div className="max-w-6xl mx-auto py-4">
      <SeoHead meta={seoMeta} />
      <PricingPlansSection headingAs="h1" showPrivacyBanner={true} />
    </div>
  );
}
