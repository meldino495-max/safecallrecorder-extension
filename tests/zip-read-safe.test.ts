import { describe, expect, it } from "vitest";
import { buildStoreZip } from "../src/zip-store";
import { readStoreZip } from "../src/zip-read";

describe("readStoreZip path safety", () => {
  it("reads normal entries", async () => {
    const blob = buildStoreZip([{ name: "blobs/chunks/a.bin", data: new Uint8Array([1, 2, 3]) }]);
    const map = readStoreZip(await blob.arrayBuffer());
    expect(map.get("blobs/chunks/a.bin")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects zip-slip style names", async () => {
    const blob = buildStoreZip([{ name: "../evil.bin", data: new Uint8Array([9]) }]);
    await expect(async () => readStoreZip(await blob.arrayBuffer())).rejects.toThrow(/路径非法/);
  });
});
