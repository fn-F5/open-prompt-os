import * as React from "react";

export interface ReducedEffectsState {
  readonly prefersReducedMotion: boolean;
  readonly prefersReducedTransparency: boolean;
  readonly saveData: boolean;
  readonly shouldReduceEffects: boolean;
}

export function useReducedEffects(): ReducedEffectsState {
  const [state, setState] = React.useState<ReducedEffectsState>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return {
        prefersReducedMotion: false,
        prefersReducedTransparency: false,
        saveData: false,
        shouldReduceEffects: false,
      };
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reducedTrans = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    const saveData = Boolean(nav.connection?.saveData);

    return {
      prefersReducedMotion: reducedMotion,
      prefersReducedTransparency: reducedTrans,
      saveData,
      shouldReduceEffects: reducedMotion || reducedTrans || saveData,
    };
  });

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const transMq = window.matchMedia("(prefers-reduced-transparency: reduce)");

    const update = () => {
      const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
      const saveData = Boolean(nav.connection?.saveData);
      setState({
        prefersReducedMotion: motionMq.matches,
        prefersReducedTransparency: transMq.matches,
        saveData,
        shouldReduceEffects: motionMq.matches || transMq.matches || saveData,
      });
    };

    motionMq.addEventListener("change", update);
    transMq.addEventListener("change", update);
    return () => {
      motionMq.removeEventListener("change", update);
      transMq.removeEventListener("change", update);
    };
  }, []);

  return state;
}
