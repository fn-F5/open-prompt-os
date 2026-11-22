/**
 * Parses `MM:SS` or `HH:MM:SS` timecodes into seconds.
 */
export function parseTimecodeToSeconds(timecode: string): number {
  const parts = timecode
    .trim()
    .split(":")
    .map((part) => Number.parseFloat(part));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 1) return parts[0] ?? 0;
  if (parts.length === 2) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  if (parts.length === 3) {
    return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  }
  return 0;
}

/**
 * Extracts client-side JPEG thumbnails for each timestamp from a local File using HTML5 <video> + <canvas>.
 * Returns an empty map cleanly in non-DOM/test environments or if codec playback is unsupported.
 */
export async function extractShotThumbnails(
  file: File,
  timestampsSec: readonly number[],
): Promise<Record<number, string>> {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function" ||
    timestampsSec.length === 0
  ) {
    return {};
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";

  const results: Record<number, string> = {};

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("metadata timeout")), 5000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("video load error"));
      };
      video.src = objectUrl;
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    const width = Math.min(320, video.videoWidth || 320);
    const aspect =
      video.videoWidth > 0 && video.videoHeight > 0 ? video.videoHeight / video.videoWidth : 9 / 16;
    const height = Math.max(1, Math.round(width * aspect));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return results;

    for (let index = 0; index < timestampsSec.length; index += 1) {
      const requested = timestampsSec[index] ?? 0;
      const clamped =
        duration > 0.2 ? Math.min(Math.max(0.05, requested), Math.max(0.05, duration - 0.1)) : 0;

      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(() => resolve(), 1200);
        video.onseeked = () => {
          window.clearTimeout(timer);
          resolve();
        };
        video.currentTime = clamped;
      });

      ctx.drawImage(video, 0, 0, width, height);
      results[index] = canvas.toDataURL("image/jpeg", 0.72);
    }
  } catch {
    return results;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }

  return results;
}
