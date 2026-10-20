/**
 * Bake OAuth client IDs for dual-path Connect Drive.
 *
 * Chrome 扩展程序 → manifest.json oauth2.client_id (getAuthToken):
 *   node scripts/bake-oauth-client.mjs --chrome <client-id>.apps.googleusercontent.com
 *
 * Web 应用 → builtin-oauth.ts (refresh-token when secret is in 高级):
 *   node scripts/bake-oauth-client.mjs --web <client-id>.apps.googleusercontent.com
 *
 * Both can be baked; neither overwrites the other.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const kind = args[0] === "--chrome" || args[0] === "--web" ? args.shift() : "--web";
const clientId = (args[0] || "").trim();

if (!/^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(clientId)) {
  console.error(
    "Usage:\n" +
      "  node scripts/bake-oauth-client.mjs --web <id>.apps.googleusercontent.com\n" +
      "  node scripts/bake-oauth-client.mjs --chrome <id>.apps.googleusercontent.com"
  );
  process.exit(1);
}

const manifestPath = join(root, "public/manifest.json");
const builtinPath = join(root, "src/google-drive/builtin-oauth.ts");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
let builtin = readFileSync(builtinPath, "utf8");

if (kind === "--chrome") {
  manifest.oauth2 = manifest.oauth2 || {};
  manifest.oauth2.client_id = clientId;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Baked Chrome Extension client into manifest.json:\n  ${clientId}`);
} else {
  if (!/export const BUILTIN_GOOGLE_OAUTH_CLIENT_ID =/.test(builtin)) {
    console.error("builtin-oauth.ts missing BUILTIN_GOOGLE_OAUTH_CLIENT_ID");
    process.exit(1);
  }
  builtin = builtin.replace(
    /export const BUILTIN_GOOGLE_OAUTH_CLIENT_ID =\s*"[^"]*";/,
    `export const BUILTIN_GOOGLE_OAUTH_CLIENT_ID =\n  "${clientId}";`
  );
  writeFileSync(builtinPath, builtin, "utf8");
  console.log(`Baked Web client into builtin-oauth.ts:\n  ${clientId}`);
}
