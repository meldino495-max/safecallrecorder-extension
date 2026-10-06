import { describe, expect, it, vi } from "vitest";
import { isTrustedExtensionSender } from "../src/ipc-guard";

describe("isTrustedExtensionSender", () => {
  it("accepts same-extension chrome-extension URL", () => {
    vi.stubGlobal("chrome", { runtime: { id: "extid123" } });
    expect(
      isTrustedExtensionSender({
        id: "extid123",
        url: "chrome-extension://extid123/dashboard.html"
      })
    ).toBe(true);
  });

  it("rejects other extension ids", () => {
    vi.stubGlobal("chrome", { runtime: { id: "extid123" } });
    expect(
      isTrustedExtensionSender({
        id: "other",
        url: "chrome-extension://other/page.html"
      })
    ).toBe(false);
  });

  it("rejects web page senders", () => {
    vi.stubGlobal("chrome", { runtime: { id: "extid123" } });
    expect(
      isTrustedExtensionSender({
        id: "extid123",
        url: "https://evil.example/page"
      })
    ).toBe(false);
  });
});
