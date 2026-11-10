import * as React from "react";
import { PromptComposer } from "../components/composer/prompt-composer.js";
import { OutputCard } from "../components/output/output-card.js";
import { useComposePrompt } from "../hooks/use-compose-prompt.js";
import { trackEvent } from "../lib/telemetry.js";
import { useComposerStore } from "../state/composer-store.js";

export function ComposerPage() {
  const { activeDraft, completedOutput, streamingBuffer } = useComposerStore();
  const composeMutation = useComposePrompt();

  React.useEffect(() => {
    trackEvent("composer_viewed", { mode: activeDraft.mode });
  }, [activeDraft.mode]);

  const handleSubmit = (followUpAnswers?: Record<string, string>) => {
    composeMutation.mutate({
      draft: activeDraft,
      followUpAnswers,
    });
  };

  return (
    <div className="space-y-4">
      <PromptComposer
        isPending={composeMutation.isPending}
        onSubmitPrompt={handleSubmit}
        onStopGeneration={composeMutation.stopGeneration}
      />

      <OutputCard
        draft={activeDraft}
        output={completedOutput}
        streamingBuffer={streamingBuffer}
        isPending={composeMutation.isPending}
        error={composeMutation.error}
        onRetry={() => handleSubmit()}
      />
    </div>
  );
}
