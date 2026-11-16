# Image & Cinema Video Prompt Engineering Guide

> **Direct Answer:** Open Prompt OS includes dedicated **Image Studio** and **Cinema Video** modes that replace vague aesthetic adjectives with physical camera optics (focal length, aperture, shutter angle), lighting geometry, temporal beats (24fps continuity), and negative guardrails for Imagen, FLUX, Midjourney, Veo, Sora, and Runway.

---

## Mode-Specific Building Blocks

| Parameter | Text / Work Mode | Image Studio Mode | Cinema Video Mode |
| :--- | :--- | :--- | :--- |
| **Subject / Goal** | Objective & deliverable | Subject geometry & material finish | Scene arc (`[Opening_Frame]` → `[Closing_Beat]`) |
| **Technical Specs** | Output schema & length | Lens focal length, aperture (`85mm f/2.0`), aspect ratio | Frame rate (`24fps`), shutter angle (`180°`), duration |
| **Lighting & Style** | Persona & tone | Volumetric key light, rim light, film grain | Continuous light sweep, atmospheric depth |
| **Guardrails** | Anti-hallucination rules | Negative prompts (no distorted text, no neon cast) | Physics continuity (no morphing textures or flicker) |

## Best Practices for Studio Visuals

- **Specify physical optics over buzzwords:** Replacing `"hyperrealistic 8K"` with `"85mm prime lens, f/2.0 shallow depth of field, soft volumetric key light"` produces consistent photographic depth.
- **Anchor material & surface interaction:** Describe how light hits `[Material_Finish]` on `[Surface_Context]` (e.g., brushed anodized aluminum on matte basalt).
- **Use negative guardrails intentionally:** Explicitly exclude common failure modes like floating artifacts, deformed typography, or unintended color casts.

## Best Practices for Temporal Video Prompts

- **Describe one continuous camera move per shot:** Specify orbital tracking, dolly push-in, or crane rise alongside duration (e.g., `6-second continuous tracking shot`).
- **Define start and end states:** Anchor `[Opening_Frame]` and `[Reveal_State]` so video models maintain object permanence across frames.
