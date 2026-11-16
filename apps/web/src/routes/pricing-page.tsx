import { PricingPlansSection } from "../components/pricing/pricing-plans-section.js";

export function PricingPage() {
  return (
    <div className="max-w-6xl mx-auto py-4">
      <PricingPlansSection headingAs="h1" showPrivacyBanner={true} />
    </div>
  );
}
