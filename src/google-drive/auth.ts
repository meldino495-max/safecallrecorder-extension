import { getSettings, setSettings, storageGet, storageRemove, storageSet } from "../extension-storage";
import { MessageType, requestId, type Request, type Response } from "../messages";
import type { GoogleDriveAuthSessionExport } from "./config-backup";
import { getBuiltinGoogleOAuthClientId, getBuiltinGoogleOAuthClientSecret } from "./builtin-oauth";
import {
  DRIVE_SCOPES,
  getGoogleRedirectUri,
  getManifestOAuthClientId,
  googleDriveSetupHint,
  resolveGoogleClientId,
  resolveGoogleClientSecretAsync,
  resolveWebOAuthClientId,
  usesChromeIdentityAuth,
  usesUiOAuthClientId
} from "./config";
import {
  exchangeAuthorizationCode,
  parseOAuthCodeFromResponseUrl,
  refreshOAuthAccessToken
} from "./oauth-token";

const TOKEN_CACHE_KEY = "googleDriveTokenCache";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
  clientId: string;
  refreshToken?: string;
};

function hasIdentityApi(): boolean {
  return (
    typeof chrome?.identity?.getAuthToken === "function" &&
    typeof chrome?.identity?.launchWebAuthFlow === "function"
  );
}

async function readTokenCache(): Promise<TokenCache | null> {
  const data = await storageGet(TOKEN_CACHE_KEY);
  const cache = data[TOKEN_CACHE_KEY] as TokenCache | undefined;
  return cache?.accessToken || cache?.refreshToken ? cache : null;
}

async function writeTokenCache(cache: TokenCache | null) {
  if (!cache) {
    await storageRemove(TOKEN_CACHE_KEY);
    return;
  }
  await storageSet({ [TOKEN_CACHE_KEY]: cache });
}

export async function clearGoogleTokenCache() {
  await writeTokenCache(null);
}

function parseTokenFromResponseUrl(responseUrl: string): { token: string; expiresAt: number } {
  const url = new URL(responseUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.search.slice(1));
  const oauthError = params.get("error");
  if (oauthError) {
    const desc = params.get("error_description")?.trim();
    throw new Error(desc ? `Google 授权失败：${oauthError}（${desc}）` : `Google 授权失败：${oauthError}`);
  }
  const token = params.get("access_token");
  if (!token) throw new Error("Google 授权未完成，未返回 access_token。");
  const expiresIn = Number(params.get("expires_in") || 3600);
  return { token, expiresAt: Date.now() + Math.max(60, expiresIn) * 1000 };
}

/** @internal exported for tests */
export function parseOAuthTokenFromResponseUrl(responseUrl: string): { token: string; expiresAt: number } {
  return parseTokenFromResponseUrl(responseUrl);
}

type WebAuthPrompt = "none" | "select_account" | "consent_select_account";

async function launchWebAuthFlow(url: string, interactive: boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          "Google 授权超时：浏览器可能拦截了弹窗。请在 Brave/Chrome 中允许 SafeCallRecorder 的弹出窗口，或暂时关闭 Shields 后重试。"
        )
      );
    }, 120_000);
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectedTo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const err = chrome.runtime.lastError;
      if (err || !redirectedTo) {
        const msg = err?.message || "Google 授权被取消或失败";
        reject(
          new Error(
            /popup|blocked|closed|user/i.test(msg)
              ? `${msg}。若使用 Brave，请在地址栏 Shields 中允许弹出窗口，或换用 Chrome 试一次。`
              : msg
          )
        );
        return;
      }
      resolve(redirectedTo);
    });
  });
}

async function cacheTokens(
  clientId: string,
  tokens: { access_token: string; expires_in: number; refresh_token?: string },
  previousRefreshToken?: string
): Promise<string> {
  const next: TokenCache = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + Math.max(60, tokens.expires_in) * 1000,
    clientId,
    refreshToken: tokens.refresh_token ?? previousRefreshToken
  };
  await writeTokenCache(next);
  return next.accessToken;
}

async function refreshWithStoredRefreshToken(
  clientId: string,
  clientSecret: string,
  cached: TokenCache
): Promise<string | null> {
  if (!cached.refreshToken) return null;
  try {
    const tokens = await refreshOAuthAccessToken({
      refreshToken: cached.refreshToken,
      clientId,
      clientSecret
    });
    return cacheTokens(clientId, tokens, cached.refreshToken);
  } catch {
    return null;
  }
}

async function getAuthTokenViaAuthCodeFlow(
  clientId: string,
  clientSecret: string,
  options: { interactive: boolean; prompt?: WebAuthPrompt; needRefreshToken?: boolean }
): Promise<string> {
  const prompt =
    options.prompt ??
    (options.needRefreshToken ? "consent_select_account" : options.interactive ? "select_account" : "none");
  const redirectUri = getGoogleRedirectUri();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set(
    "prompt",
    prompt === "consent_select_account" ? "consent select_account" : prompt
  );

  const responseUrl = await launchWebAuthFlow(authUrl.toString(), options.interactive);
  const code = parseOAuthCodeFromResponseUrl(responseUrl);
  const tokens = await exchangeAuthorizationCode({
    code,
    clientId,
    redirectUri,
    clientSecret
  });
  const cached = await readTokenCache();
  return cacheTokens(clientId, tokens, cached?.refreshToken);
}

async function getAuthTokenViaImplicitWebAuthFlow(
  clientId: string,
  options: { interactive: boolean; prompt?: WebAuthPrompt }
): Promise<string> {
  const prompt =
    options.prompt ?? (options.interactive ? "consent_select_account" : "none");
  const redirectUri = getGoogleRedirectUri();
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "token");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", DRIVE_SCOPES.join(" "));
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set(
    "prompt",
    prompt === "consent_select_account" ? "consent select_account" : prompt
  );

  const responseUrl = await launchWebAuthFlow(authUrl.toString(), options.interactive);
  const { token, expiresAt } = parseTokenFromResponseUrl(responseUrl);
  await writeTokenCache({ accessToken: token, expiresAt, clientId });
  return token;
}

/**
 * Acquire a Web OAuth token.
 * When interactive=false: only cache / refresh-token / silent prompt=none — never open a login window.
 * Login UI is reserved for explicit「连接 Drive」clicks (interactive=true).
 */
async function acquireWebFlowToken(clientId: string, interactive: boolean): Promise<string> {
  const settings = await getSettings();
  const clientSecret = await resolveGoogleClientSecretAsync(settings);
  const cached = await readTokenCache();

  if (cached && cached.clientId === clientId && cached.expiresAt > Date.now() + 60_000 && cached.accessToken) {
    return cached.accessToken;
  }

  if (clientSecret) {
    if (cached?.refreshToken && cached.clientId === clientId) {
      const refreshed = await refreshWithStoredRefreshToken(clientId, clientSecret, cached);
      if (refreshed) return refreshed;
    }

    if (!interactive) {
      try {
        return await getAuthTokenViaAuthCodeFlow(clientId, clientSecret, {
          interactive: false,
          prompt: "none"
        });
      } catch {
        throw new Error("Google 登录已失效，请点「连接 Drive」重新授权。");
      }
    }

    const needRefreshToken = !cached?.refreshToken;
    return getAuthTokenViaAuthCodeFlow(clientId, clientSecret, {
      interactive: true,
      needRefreshToken,
      prompt: needRefreshToken ? "consent_select_account" : "select_account"
    });
  }

  if (!interactive) {
    try {
      return await getAuthTokenViaImplicitWebAuthFlow(clientId, {
        interactive: false,
        prompt: "none"
      });
    } catch {
      throw new Error("Google 登录已失效，请点「连接 Drive」重新授权。");
    }
  }

  return getAuthTokenViaImplicitWebAuthFlow(clientId, {
    interactive: true,
    prompt: "consent_select_account"
  });
}

async function getAuthTokenFromManifest(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (result) => {
      const err = chrome.runtime.lastError;
      const token = typeof result === "string" ? result : (result as { token?: string } | undefined)?.token;
      if (err || !token) {
        reject(new Error(err?.message || "无法获取 Google 授权令牌"));
        return;
      }
      resolve(token);
    });
  });
}

async function requestAuthTokenViaServiceWorker(interactive: boolean): Promise<string> {
  const response = await chrome.runtime.sendMessage({
    type: MessageType.GoogleDriveGetAuthToken,
    target: "service-worker",
    requestId: requestId(),
    payload: { interactive }
  } satisfies Request);
  const res = response as Response;
  if (!res?.ok) {
    throw new Error(res?.error?.message || "无法从后台获取 Google 授权令牌");
  }
  const token = (res.data as { token?: string } | undefined)?.token;
  if (!token) throw new Error("无法从后台获取 Google 授权令牌");
  return token;
}

/**
 * Dual auth:
 * 1) Web refresh token (works even after browser Google logout) when secret was saved
 * 2) chrome.identity.getAuthToken while the browser Google session exists
 * 3) Web interactive / silent flow as fallback
 */
export async function getGoogleAuthTokenInBackground(interactive: boolean): Promise<string> {
  const settings = await getSettings();
  const webClientId = resolveWebOAuthClientId(settings);
  const chromeClientId = getManifestOAuthClientId();
  if (!webClientId && !chromeClientId) throw new Error(googleDriveSetupHint());
  if (!hasIdentityApi()) {
    throw new Error("当前环境不支持 Google 登录（需要 Chrome 扩展 identity 权限）。");
  }

  const secret = await resolveGoogleClientSecretAsync(settings);

  // 1) Offline renew via refresh token (Web client + secret)
  if (webClientId && secret) {
    const cached = await readTokenCache();
    if (cached?.clientId === webClientId) {
      if (cached.accessToken && cached.expiresAt > Date.now() + 60_000) {
        return cached.accessToken;
      }
      if (cached.refreshToken) {
        const refreshed = await refreshWithStoredRefreshToken(webClientId, secret, cached);
        if (refreshed) return refreshed;
      }
    }
  }

  // 2) Chrome-managed token (skip when user pasted a custom Web client ID)
  if (chromeClientId && !usesUiOAuthClientId(settings)) {
    try {
      return await getAuthTokenFromManifest(interactive);
    } catch (e) {
      if (!webClientId) throw e;
      if (!interactive) {
        // Silent status checks must not open a login window via Web fallback.
        throw e instanceof Error ? e : new Error(String(e));
      }
      // Browser signed out of Google — fall through to Web / refresh token
    }
  }

  // 3) Web OAuth (with secret → refresh token; without → ~1h implicit)
  if (webClientId) {
    return acquireWebFlowToken(webClientId, interactive);
  }

  throw new Error(googleDriveSetupHint());
}

export async function getGoogleAuthToken(interactive: boolean): Promise<string> {
  const settings = await getSettings();
  if (!resolveWebOAuthClientId(settings) && !getManifestOAuthClientId()) {
    throw new Error(googleDriveSetupHint());
  }

  if (!hasIdentityApi()) {
    return requestAuthTokenViaServiceWorker(interactive);
  }

  return getGoogleAuthTokenInBackground(interactive);
}

export async function revokeGoogleAuthToken(): Promise<void> {
  const cached = await readTokenCache();
  await clearGoogleTokenCache();
  for (const token of [cached?.accessToken, cached?.refreshToken]) {
    if (!token) continue;
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-type": "application/x-www-form-urlencoded" }
      });
    } catch {
      /* ignore */
    }
  }
  if (!hasIdentityApi()) return;
  const token = await getAuthTokenFromManifest(false).catch(() => "");
  if (!token) return;
  await new Promise<void>((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

export async function fetchGoogleAccountEmail(token: string): Promise<string | undefined> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { email?: string };
  return data.email;
}

export type ConnectGoogleAccountMode = "auto" | "builtin" | "custom";

/**
 * - builtin: Chrome Extension client (+ optional baked Web secret); ignores UI-pasted client ID
 * - custom: Web 应用 client from the control-panel fields only
 * - auto: prefer custom ID when pasted, otherwise builtin
 */
export async function connectGoogleAccount(
  options?: { mode?: ConnectGoogleAccountMode }
): Promise<{ email?: string }> {
  const settings = await getSettings();
  const mode = options?.mode ?? "auto";
  const uiClientId = settings.googleDriveClientId?.trim() || undefined;
  const chromeClientId = mode === "custom" ? undefined : getManifestOAuthClientId();
  const webClientId =
    mode === "builtin"
      ? getBuiltinGoogleOAuthClientId()
      : mode === "custom"
        ? uiClientId
        : uiClientId || getBuiltinGoogleOAuthClientId();

  if (mode === "custom" && !webClientId) {
    throw new Error("请先在「高级」粘贴自建 Web 应用的 OAuth 客户端 ID，再点「用自建客户端连接 Drive」。");
  }
  if (!webClientId && !chromeClientId) throw new Error(googleDriveSetupHint());

  let email: string | undefined;
  let lastError: Error | undefined;

  // Builtin / auto without custom ID: one-click Chrome identity
  if (mode !== "custom" && chromeClientId && hasIdentityApi() && !(mode === "auto" && uiClientId)) {
    try {
      const token = await getAuthTokenFromManifest(true);
      email = await fetchGoogleAccountEmail(token);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  // Web flow: custom always; builtin/auto when secret or Chrome failed / no Chrome client
  const secret =
    mode === "builtin"
      ? getBuiltinGoogleOAuthClientSecret() ||
        (!uiClientId ? settings.googleDriveClientSecret?.trim() || undefined : undefined)
      : await resolveGoogleClientSecretAsync(settings);
  if (webClientId && secret) {
    try {
      await acquireWebFlowToken(webClientId, true);
      if (!email) {
        const token = await getGoogleAuthToken(false);
        email = await fetchGoogleAccountEmail(token);
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!email) throw lastError;
    }
  } else if ((!email || mode === "custom") && webClientId) {
    try {
      const token = await acquireWebFlowToken(webClientId, true);
      email = await fetchGoogleAccountEmail(token);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      throw lastError;
    }
  } else if (!email) {
    throw lastError ?? new Error(googleDriveSetupHint());
  }

  return { email };
}

/** Persist Gmail on settings when OAuth works but email was not saved (e.g. older scopes). */
export async function ensureGoogleAccountEmailSaved(): Promise<string | undefined> {
  const settings = await getSettings();
  const existing = settings.googleDriveAccountEmail?.trim();
  if (existing) return existing;
  try {
    const token = await getGoogleAuthToken(false);
    const email = (await fetchGoogleAccountEmail(token))?.trim();
    if (!email) return undefined;
    await setSettings({ googleDriveAccountEmail: email });
    return email;
  } catch {
    return undefined;
  }
}

export function getExtensionAuthInfo() {
  return {
    extensionId: chrome.runtime.id,
    redirectUri: getGoogleRedirectUri(),
    manifestClientConfigured: Boolean(getManifestOAuthClientId())
  };
}

/** True when a Web refresh token is stored (offline renew after browser Google logout). */
export async function hasGoogleAuthRefreshToken(): Promise<boolean> {
  const settings = await getSettings();
  const webClientId = resolveWebOAuthClientId(settings);
  if (!webClientId) return false;
  const cached = await readTokenCache();
  return Boolean(cached?.refreshToken && cached.clientId === webClientId);
}

/** Whether auth can still upload without reconnecting. */
export async function isGoogleAuthSessionValid(): Promise<boolean> {
  const settings = await getSettings();
  if (!settings.googleDriveAccountEmail?.trim()) return false;

  if (await hasGoogleAuthRefreshToken()) return true;

  if (usesChromeIdentityAuth() && hasIdentityApi()) {
    try {
      await getAuthTokenFromManifest(false);
      return true;
    } catch {
      /* try web cache below */
    }
  }

  const webClientId = resolveWebOAuthClientId(settings);
  if (!webClientId) return false;
  const cached = await readTokenCache();
  if (!cached || cached.clientId !== webClientId) return false;
  return Boolean(cached.accessToken && cached.expiresAt > Date.now() + 30_000);
}

/** Unix ms when short-lived Web token expires; null if offline refresh or Chrome-managed. */
export async function getGoogleAuthSessionExpiry(): Promise<number | null> {
  if (await hasGoogleAuthRefreshToken()) return null;
  if (usesChromeIdentityAuth()) {
    // Chrome manages renew while signed in — no fixed expiry to show.
    // Still show nothing when silent token works; short-lived only for pure web cache.
    try {
      if (hasIdentityApi()) {
        await getAuthTokenFromManifest(false);
        return null;
      }
    } catch {
      /* fall through to web cache expiry */
    }
  }
  const settings = await getSettings();
  const webClientId = resolveWebOAuthClientId(settings);
  if (!webClientId) return null;
  const cached = await readTokenCache();
  if (!cached || cached.clientId !== webClientId) return null;
  return cached.expiresAt;
}

/** Include in exported config when OAuth session or refresh token is available. */
export async function getAuthSessionForExport(): Promise<GoogleDriveAuthSessionExport | null> {
  const settings = await getSettings();
  const clientId = await resolveGoogleClientId(settings);
  if (!clientId) return null;
  const cached = await readTokenCache();
  if (!cached || cached.clientId !== clientId) return null;
  if (cached.refreshToken) {
    return {
      accessToken: cached.accessToken || "",
      expiresAt: cached.expiresAt || 0,
      clientId: cached.clientId,
      refreshToken: cached.refreshToken
    };
  }
  if (!cached.accessToken || cached.expiresAt <= Date.now() + 30_000) return null;
  return {
    accessToken: cached.accessToken,
    expiresAt: cached.expiresAt,
    clientId: cached.clientId
  };
}

export async function restoreAuthSessionFromExport(
  session: GoogleDriveAuthSessionExport
): Promise<{ ok: boolean; email?: string }> {
  const settings = await getSettings();
  const sessionClientId = session.clientId?.trim();
  if (!sessionClientId) return { ok: false };
  let clientId = (await resolveGoogleClientId(settings))?.trim();
  if (!clientId) {
    clientId = sessionClientId;
    await setSettings({ googleDriveClientId: sessionClientId });
  } else if (clientId !== sessionClientId) {
    const storedId = settings.googleDriveClientId?.trim();
    if (storedId !== sessionClientId) return { ok: false };
    clientId = sessionClientId;
  }

  const clientSecret = await resolveGoogleClientSecretAsync(await getSettings());
  const refreshToken = session.refreshToken?.trim();

  if (refreshToken && clientSecret) {
    await writeTokenCache({
      accessToken: session.accessToken || "",
      expiresAt: session.expiresAt || 0,
      clientId: session.clientId,
      refreshToken
    });
    try {
      const accessToken = await refreshWithStoredRefreshToken(clientId, clientSecret, {
        accessToken: session.accessToken || "",
        expiresAt: session.expiresAt || 0,
        clientId: session.clientId,
        refreshToken
      });
      if (!accessToken) return { ok: false };
      const email = (await fetchGoogleAccountEmail(accessToken))?.trim();
      if (!email) {
        await clearGoogleTokenCache();
        return { ok: false };
      }
      await setSettings({ googleDriveAccountEmail: email });
      return { ok: true, email };
    } catch {
      await clearGoogleTokenCache();
      return { ok: false };
    }
  }

  if (!session.accessToken?.trim() || session.expiresAt <= Date.now() + 30_000) {
    return { ok: false };
  }

  await writeTokenCache({
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    clientId: session.clientId
  });

  const email = (await fetchGoogleAccountEmail(session.accessToken))?.trim();
  if (!email) {
    await clearGoogleTokenCache();
    return { ok: false };
  }
  await setSettings({ googleDriveAccountEmail: email });
  return { ok: true, email };
}
