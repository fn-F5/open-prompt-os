import { capturePostHogEvent } from "./posthog.js";

/**
 * Standardized present-tense verbs enforced by the PostHog event schema.
 */
export type AnalyticsVerb =
  | "click"
  | "submit"
  | "create"
  | "view"
  | "add"
  | "update"
  | "delete"
  | "start"
  | "end"
  | "cancel"
  | "fail"
  | "generate";

/**
 * Strict `category:object_action` event names in lowercase `snake_case`.
 */
export type AnalyticsEventName =
  // Navigation
  | "navigation:route_view"
  | "navigation:nav_link_click"
  | "navigation:brand_logo_click"
  | "navigation:mobile_menu_click"
  | "navigation:footer_link_click"
  | "navigation:settings_tab_click"
  | "navigation:theme_toggle_click"
  // Auth & Account
  | "auth:sign_in_button_click"
  | "auth:get_started_button_click"
  | "auth:sign_out_button_click"
  | "auth:oauth_button_click"
  | "auth:passkey_button_click"
  | "auth:forgot_password_button_click"
  | "auth:auth_form_submit"
  | "account_settings:profile_update"
  | "account_settings:passkey_add"
  | "account_settings:passkey_delete"
  // Composer
  | "composer:mode_button_click"
  | "composer:compile_button_click"
  | "composer:stop_button_click"
  | "composer:advanced_controls_click"
  | "composer:model_picker_click"
  | "composer:guided_parameter_click"
  | "composer:example_chip_click"
  // Output & Dispatch
  | "output:copy_button_click"
  | "output:save_button_click"
  | "output:share_button_click"
  | "output:dispatch_button_click"
  | "output:retry_button_click"
  // Autopsy & Reverse Engineer
  | "autopsy:analyze_button_click"
  | "autopsy:save_button_click"
  | "reverse_engineer:analyze_button_click"
  | "reverse_engineer:save_button_click"
  // Templates, Library & History
  | "templates:use_button_click"
  | "templates:filter_button_click"
  | "library:prompt_copy_click"
  | "library:prompt_delete"
  | "history:item_click"
  // Pricing, Feedback, Onboarding & Marketing
  | "pricing:plan_button_click"
  | "pricing:interest_form_submit"
  | "feedback:open_button_click"
  | "feedback:form_submit"
  | "onboarding:tour_button_click"
  | "onboarding:hotspot_button_click"
  | "marketing:cta_button_click"
  // Generic fallback for unannotated UI buttons
  | "ui:button_click";

export type AnalyticsPrimitive = string | number | boolean | null | undefined;
export type AnalyticsProperties = Readonly<Record<string, AnalyticsPrimitive>>;

const EVENT_NAME_PATTERN =
  /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*_(click|submit|create|view|add|update|delete|start|end|cancel|fail|generate)$/;

export function isValidAnalyticsEventName(name: string): name is AnalyticsEventName {
  return EVENT_NAME_PATTERN.test(name);
}

/**
 * Tracks a strictly typed `category:object_action` event with flat properties.
 */
export function trackAnalyticsEvent(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
): boolean {
  if (!isValidAnalyticsEventName(eventName)) {
    return false;
  }
  return capturePostHogEvent(eventName, properties);
}
