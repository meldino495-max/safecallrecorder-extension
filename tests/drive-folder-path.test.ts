import { describe, expect, it } from "vitest";
import { driveFolderPathFromChain } from "../src/google-drive/drive-api";

describe("drive folder path", () => {
  it("builds a path from the folder up to My Drive", () => {
    const path = driveFolderPathFromChain(
      [
        { id: "rootid", name: "My Drive" },
        { id: "parent", name: "通话", parents: ["rootid"] },
        { id: "child", name: "2026", parents: ["parent"] }
      ],
      "child"
    );
    expect(path).toBe("我的云端硬盘 / 通话 / 2026");
  });

  it("prefixes My Drive for a folder directly under root", () => {
    const path = driveFolderPathFromChain(
      [{ id: "folder", name: "SafeCallRecorder", parents: ["rootid"] }],
      "folder"
    );
    expect(path).toBe("我的云端硬盘 / SafeCallRecorder");
  });

  it("returns undefined when the folder itself cannot be read", () => {
    expect(driveFolderPathFromChain([], "missing")).toBeUndefined();
  });
});
