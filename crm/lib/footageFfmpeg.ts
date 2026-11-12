import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG_CANDIDATES = [
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "ffmpeg",
];

const FFPROBE_CANDIDATES = [
  "/opt/homebrew/bin/ffprobe",
  "/usr/local/bin/ffprobe",
  "ffprobe",
];

export function resolveFfmpeg(): string {
  for (const bin of FFMPEG_CANDIDATES) {
    try {
      if (bin.startsWith("/") && fs.existsSync(bin)) return bin;
      const res = spawnSync(bin, ["-version"], { stdio: "ignore" });
      if (res.status === 0) return bin;
    } catch {
      // Continue to next candidate
    }
  }
  return "ffmpeg";
}

export function resolveFfprobe(): string {
  for (const bin of FFPROBE_CANDIDATES) {
    try {
      if (bin.startsWith("/") && fs.existsSync(bin)) return bin;
      const res = spawnSync(bin, ["-version"], { stdio: "ignore" });
      if (res.status === 0) return bin;
    } catch {
      // Continue to next candidate
    }
  }
  return "ffprobe";
}

export type VideoMeta = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  resolution: string;
};

/**
 * Reads video stream and format information using ffprobe.
 */
export function probeVideo(filePath: string): VideoMeta {
  const ffprobe = resolveFfprobe();
  try {
    const res = spawnSync(
      ffprobe,
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,duration",
        "-show_entries", "format=duration",
        "-of", "json",
        filePath,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );

    if (res.status !== 0 || !res.stdout) {
      return { duration: 0, width: 1920, height: 1080, fps: 30, resolution: "1920x1080" };
    }

    const data = JSON.parse(res.stdout);
    const stream = data.streams?.[0] || {};
    const format = data.format || {};

    const width = Number(stream.width) || 1920;
    const height = Number(stream.height) || 1080;
    const duration = Number(stream.duration || format.duration) || 0;

    let fps = 30;
    if (stream.r_frame_rate && typeof stream.r_frame_rate === "string") {
      const parts = stream.r_frame_rate.split("/").map(Number);
      if (parts.length === 2 && parts[1] > 0) {
        fps = Number((parts[0] / parts[1]).toFixed(2));
      } else if (!isNaN(Number(stream.r_frame_rate))) {
        fps = Number(Number(stream.r_frame_rate).toFixed(2));
      }
    }

    return {
      duration: Number(duration.toFixed(2)),
      width,
      height,
      fps,
      resolution: `${width}x${height}`,
    };
  } catch (err) {
    console.error(`ffprobe failed for ${filePath}:`, err);
    return { duration: 0, width: 1920, height: 1080, fps: 30, resolution: "1920x1080" };
  }
}

/**
 * Extracts a single preview frame at a given timestamp using ffmpeg.
 */
export function extractFrame(
  filePath: string,
  outJpgPath: string,
  timestampSeconds = 1.0
): boolean {
  const ffmpeg = resolveFfmpeg();
  try {
    const dir = path.dirname(outJpgPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const res = spawnSync(
      ffmpeg,
      [
        "-ss", String(timestampSeconds),
        "-i", filePath,
        "-frames:v", "1",
        "-q:v", "2",
        "-vf", "scale='min(640,iw)':-2",
        "-y",
        outJpgPath,
      ],
      { stdio: "ignore" }
    );

    return res.status === 0 && fs.existsSync(outJpgPath);
  } catch (err) {
    console.error(`ffmpeg extractFrame failed for ${filePath}:`, err);
    return false;
  }
}
