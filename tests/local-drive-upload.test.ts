import { describe, expect, it } from "vitest";
import {
  isLocalRecordingFile,
  localRecordingMimeType,
  localRecordingUploadName
} from "../src/google-drive/local-upload";

describe("local recording upload", () => {
  it("accepts common recording files and rejects other documents", () => {
    expect(isLocalRecordingFile({ name: "通话.mp3" })).toBe(true);
    expect(isLocalRecordingFile({ name: "a.WAV" })).toBe(true);
    expect(isLocalRecordingFile({ name: "take.m4a" })).toBe(true);
    expect(isLocalRecordingFile({ name: "clip.webm", type: "" })).toBe(true);
    expect(isLocalRecordingFile({ name: "voice", type: "audio/mpeg" })).toBe(true);
    expect(isLocalRecordingFile({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(isLocalRecordingFile({ name: "photo.png", type: "image/png" })).toBe(false);
  });

  it("keeps the original file name and strips path characters", () => {
    expect(localRecordingUploadName("D:\\录音\\通话:1.mp3")).toBe("通话_1.mp3");
    expect(localRecordingUploadName("meeting.wav")).toBe("meeting.wav");
  });

  it("uses the browser mime type when the file provides one", () => {
    expect(localRecordingMimeType({ name: "a.mp3", type: "audio/mpeg" })).toBe("audio/mpeg");
    expect(localRecordingMimeType({ name: "a.wav", type: "" })).toBe("audio/wav");
  });
});
