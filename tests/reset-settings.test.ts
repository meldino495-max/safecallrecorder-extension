import { describe, expect, it } from "vitest";
import { defaultSettingsSnapshot } from "../src/extension-storage";

describe("reset all settings", () => {
  it("returns defaults and drops Drive credentials and custom paths", () => {
    const settings = defaultSettingsSnapshot();
    expect(settings.defaultBitrate).toBe(64000);
    expect(settings.googleDriveEnabled).toBe(false);
    expect(settings.googleDriveConnectMode).toBeNull();
    expect(settings.googleDriveClientId).toBeUndefined();
    expect(settings.googleDriveClientSecret).toBeUndefined();
    expect(settings.googleDriveFolderId).toBeUndefined();
    expect(settings.downloadFolder).toBe("");
    expect(settings.customDownloadDirectoryName).toBeUndefined();
    expect(settings.autoStartRecording).toBe(false);
    expect(settings.recordingNameProfiles?.length).toBe(1);
  });
});
