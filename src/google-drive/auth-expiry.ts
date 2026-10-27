/** Human-readable hint for Web OAuth token cache expiry (~1 hour). */
export function formatGoogleAuthExpiryHint(
  expiresAt: number | null | undefined,
  options?: { hasRefreshToken?: boolean; hasClientSecret?: boolean; now?: number }
): string | null {
  if (options?.hasRefreshToken) {
    return "已启用离线长期续期（退出浏览器 Google 账号后仍可自动续期）。";
  }
  const now = options?.now ?? Date.now();
  if (expiresAt == null || !Number.isFinite(expiresAt)) return null;
  const ms = expiresAt - now;
  if (ms <= 0) {
    return options?.hasClientSecret
      ? "这次登录已过期。客户端密钥已保存，请再点「连接 Drive」，才会换成可自动续期的长期授权。"
      : "Google 登录已过期，上传或同步时将自动刷新；若失败请点「连接 Drive」。";
  }
  const mins = Math.ceil(ms / 60_000);
  const until = new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const longTermHint = options?.hasClientSecret
    ? "密钥已保存。请再点一次「连接 Drive」，这次登录才会换成可自动续期的长期授权。"
    : "下方粘贴客户端密钥并重新「连接 Drive」后可长期自动续期。";
  if (mins <= 15) {
    return `短期登录约 ${mins} 分钟后过期（${until}）。${longTermHint}`;
  }
  if (mins < 60) {
    return `短期登录剩余约 ${mins} 分钟（至 ${until}）。${longTermHint}`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (remMins === 0) {
    return `短期登录剩余约 ${hours} 小时（至 ${until}）。${longTermHint}`;
  }
  return `短期登录剩余约 ${hours} 小时 ${remMins} 分钟（至 ${until}）。${longTermHint}`;
}

export function isGoogleAuthExpiryWarning(
  expiresAt: number | null | undefined,
  now = Date.now()
): boolean {
  if (expiresAt == null || !Number.isFinite(expiresAt)) return false;
  return expiresAt - now <= 15 * 60_000;
}
