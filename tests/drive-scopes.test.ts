import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DRIVE_SCOPES } from "../src/google-drive/config";

describe("Google Drive OAuth scopes", () => {
  it("uses least-privilege drive.file without drive.readonly", () => {
    expect(DRIVE_SCOPES).toContain("https://www.googleapis.com/auth/drive.file");
    expect(DRIVE_SCOPES).toContain("https://www.googleapis.com/auth/userinfo.email");
    expect(DRIVE_SCOPES).not.toContain("https://www.googleapis.com/auth/drive.readonly");
  });

  it("manifest oauth2 scopes match runtime DRIVE_SCOPES", () => {
    const manifest = JSON.parse(readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
    expect(manifest.oauth2.scopes).toEqual([...DRIVE_SCOPES]);
  });
});
