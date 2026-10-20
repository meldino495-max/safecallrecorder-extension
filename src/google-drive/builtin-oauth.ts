/**
 * Dual OAuth setup:
 * - Chrome Extension client → public/manifest.json oauth2.client_id (one-click + browser-managed renew)
 * - Web 应用 client below → refresh-token path when user pastes client secret in「高级」
 *   (keeps working after the browser signs out of Google)
 */
export const BUILTIN_GOOGLE_OAUTH_CLIENT_ID =
  "711099791446-o0ueej12n8ths20i6r9i9ftl3lllegqh.apps.googleusercontent.com";

/** Prefer empty in the package; users paste GOCSPX-… under 高级 for offline renew. */
export const BUILTIN_GOOGLE_OAUTH_CLIENT_SECRET = "";

const PLACEHOLDER_MARKERS = ["CONFIGURE_", "YOUR_CLIENT_ID"];

export function getBuiltinGoogleOAuthClientId(): string | undefined {
  const id = BUILTIN_GOOGLE_OAUTH_CLIENT_ID.trim();
  if (!id) return undefined;
  if (PLACEHOLDER_MARKERS.some((m) => id.includes(m))) return undefined;
  return id;
}

export function getBuiltinGoogleOAuthClientSecret(): string | undefined {
  const secret = BUILTIN_GOOGLE_OAUTH_CLIENT_SECRET.trim();
  return secret || undefined;
}
