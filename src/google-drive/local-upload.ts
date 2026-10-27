import { sanitizeFileBase } from "../filename";

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "aac",
  "webm",
  "ogg",
  "oga",
  "opus",
  "flac",
  "wma",
  "mp4",
  "mpeg",
  "mpga"
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  wma: "audio/x-ms-wma",
  mp4: "video/mp4",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg"
};

export function localRecordingExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function isLocalRecordingFile(file: { name: string; type?: string }): boolean {
  if (AUDIO_EXTENSIONS.has(localRecordingExtension(file.name))) return true;
  const type = file.type?.toLowerCase() || "";
  return type.startsWith("audio/") || type === "video/webm" || type === "video/mp4";
}

export function localRecordingUploadName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "录音";
  const ext = localRecordingExtension(base);
  const stem = ext ? base.slice(0, -(ext.length + 1)) : base;
  const cleanStem = sanitizeFileBase(stem) || "录音";
  return ext ? `${cleanStem}.${ext}` : cleanStem;
}

export function localRecordingMimeType(file: { name: string; type?: string }): string {
  const type = file.type?.trim();
  if (type && type !== "application/octet-stream") return type;
  return MIME_BY_EXTENSION[localRecordingExtension(file.name)] || "application/octet-stream";
}
