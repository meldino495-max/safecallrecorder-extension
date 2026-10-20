import { getSettings } from "../extension-storage";
import type { AppSettings } from "../types";
import { getBuiltinGoogleOAuthClientId, getBuiltinGoogleOAuthClientSecret } from "./builtin-oauth";

export const DRIVE_API = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

/**
 * Match the Audio-recording web app style so users are not blocked by Google verification:
 * - drive.file: create/upload files & folders this app owns (Sensitive, works unverified with warning)
 * - drive.metadata.readonly: list folder names the app can see (not full drive.readonly Restricted)
 * - userinfo.email: show connected account
 *
 * Avoid drive.readonly (Restricted) — Google often blocks unverified apps with
 * 「尚未完成 Google 验证流程」 for all non-test users.
 */
export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
] as const;

const PLACEHOLDER_MARKERS = ["CONFIGURE_", "YOUR_CLIENT_ID"];

export function getManifestOAuthClientId(): string | undefined {
  const oauth = chrome.runtime.getManifest().oauth2 as { client_id?: string } | undefined;
  const id = oauth?.client_id?.trim();
  if (!id) return undefined;
  if (PLACEHOLDER_MARKERS.some((m) => id.includes(m))) return undefined;
  return id;
}

export function getGoogleRedirectUri(): string {
  return `https://${chrome.runtime.id}.chromiumapp.org/`;
}

/** True when the package ships a real OAuth client (zero-config for end users). */
export function hasBakedGoogleOAuth(): boolean {
  return Boolean(getBuiltinGoogleOAuthClientId() || getManifestOAuthClientId());
}

export function isGoogleDriveConfigured(settings?: AppSettings): boolean {
  if (settings?.googleDriveClientId?.trim()) return true;
  return hasBakedGoogleOAuth();
}

export async function resolveGoogleClientId(settings?: AppSettings): Promise<string | undefined> {
  const fromSettings = settings?.googleDriveClientId?.trim();
  if (fromSettings) return fromSettings;
  const loaded = await getSettings();
  if (loaded.googleDriveClientId?.trim()) return loaded.googleDriveClientId.trim();
  return getBuiltinGoogleOAuthClientId() || getManifestOAuthClientId();
}

/** Web 应用 client ID only (for refresh-token / launchWebAuthFlow). Never the Chrome Extension manifest ID. */
export function resolveWebOAuthClientId(settings?: AppSettings): string | undefined {
  const fromSettings = settings?.googleDriveClientId?.trim();
  if (fromSettings) return fromSettings;
  return getBuiltinGoogleOAuthClientId();
}

export function resolveGoogleClientSecret(settings?: AppSettings): string | undefined {
  const fromSettings = settings?.googleDriveClientSecret?.trim();
  if (fromSettings) return fromSettings;
  return getBuiltinGoogleOAuthClientSecret();
}

export async function resolveGoogleClientSecretAsync(settings?: AppSettings): Promise<string | undefined> {
  const fromSettings = settings?.googleDriveClientSecret?.trim();
  if (fromSettings) return fromSettings;
  const loaded = await getSettings();
  if (loaded.googleDriveClientSecret?.trim()) return loaded.googleDriveClientSecret.trim();
  return getBuiltinGoogleOAuthClientSecret();
}

export function hasGoogleOAuthClientSecret(settings?: AppSettings): boolean {
  return Boolean(resolveGoogleClientSecret(settings));
}

/** True when the UI field holds a custom client ID (may force Web OAuth). */
export function usesUiOAuthClientId(settings?: AppSettings): boolean {
  const id = settings?.googleDriveClientId?.trim();
  return Boolean(id);
}

/**
 * Legacy helper: true when only Web OAuth is available (no Chrome Extension client in manifest).
 * Dual-auth token acquisition no longer branches solely on this.
 */
export function shouldUseWebOAuthFlow(settings?: AppSettings): boolean {
  if (getManifestOAuthClientId()) return false;
  return Boolean(resolveWebOAuthClientId(settings));
}

/** Manifest has a Chrome Extension OAuth client (getAuthToken). */
export function usesChromeIdentityAuth(): boolean {
  return Boolean(getManifestOAuthClientId());
}

export function googleDriveSetupHint(): string {
  return "方式一：直接点「连接 Drive」（发行包内置客户端）。方式二：展开「高级」按教程自建 Web 应用客户端，粘贴 ID/密钥。";
}

export function googleDriveClientIdHint(): string {
  return "自建时请创建「Web 应用」OAuth 客户端，并把控制面板显示的重定向 URI 加入授权列表。发行包也可直接点「连接 Drive」使用内置客户端。";
}

export function friendlyGoogleConnectError(message: string, redirectUri?: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("redirect_uri_mismatch") || lower.includes("redirect_uri")) {
    const uri =
      redirectUri ??
      (typeof chrome !== "undefined" && chrome.runtime?.id
        ? getGoogleRedirectUri()
        : "https://<扩展ID>.chromiumapp.org/");
    return (
      `Google 授权失败：重定向 URI 不匹配。` +
      `请用「Web 应用」类型客户端，并在已授权的重定向 URI 中加入：${uri} ` +
      `（须完全一致）。然后点「连接 Drive」。`
    );
  }
  if (lower.includes("access_denied") || lower.includes("403")) {
    return "Google 访问遭拒。请在 Google Cloud → 目标对象 → 测试用户 中添加你的 Gmail。";
  }
  if (lower.includes("超时") || lower.includes("popup") || lower.includes("blocked") || lower.includes("shields")) {
    return message;
  }
  return message;
}
