/** Reject extension messages that do not originate from this extension. */

export function isTrustedExtensionSender(sender: chrome.runtime.MessageSender | undefined): boolean {
  if (!sender) return false;
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  // Prefer URL when present (dashboard / offscreen / help pages).
  const url = sender.url;
  if (url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "chrome-extension:" && parsed.hostname === chrome.runtime.id;
    } catch {
      return false;
    }
  }
  // Internal SW ↔ offscreen may omit url in some Chromium builds; id match is enough.
  return sender.id === chrome.runtime.id;
}
