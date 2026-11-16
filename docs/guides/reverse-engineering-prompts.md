# Reverse Engineering Prompts from Reference Images

> **Direct Answer:** The **Reverse Engineer** tool at `/reverse-engineer` analyzes an uploaded PNG, JPEG, or WebP reference image (up to 4 MB) across a **6-axis visual breakdown**—Subject, Style & Medium, Lighting & Color, Camera & Composition, Mood & Atmosphere, and Negative Guardrails—and emits a reusable prompt draft with `[Variable]` slots for Image or Video generation.

---

## The 6-Axis Visual Breakdown

1. **Subject:** Primary focal object, pose, materials, and foreground/background separation.
2. **Style & Medium:** Photographic medium, editorial art direction, architectural render, or illustration style.
3. **Lighting & Color:** Key/fill/rim light ratios, color temperature, and tonal palette.
4. **Camera & Composition:** Framing, lens focal length, depth of field, and perspective geometry.
5. **Mood & Atmosphere:** Emotional register, texture, haze, or surface patina.
6. **Negative Guardrails:** Artifacts and stylistic drifts to suppress when regenerating.

## How to Use Reverse Engineer

1. Navigate to `/reverse-engineer` and select your target modality (**Image Prompt** or **Video Motion Prompt**).
2. Drag and drop a PNG, JPEG, or WebP file (maximum 4 MB).
3. Add optional **Focus Notes** (for example, `"Emphasize lens focal length and rim lighting"`).
4. Click **Reverse Engineer Image**, inspect the 6-axis cards and reconstructed specification, and click **Accept into Composer** to swap `[Variables]` for your own product or subject.
