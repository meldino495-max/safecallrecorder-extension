# Google Drive 上传配置

SafeCallRecorder 可将 MP3 上传到 **Google Drive**（用户自己的 Google 账号）。

控制面板提供**两种可并存**的方式：

1. **方式一（推荐）**：发行包已内置 OAuth → 用户只需启用后点 **连接 Drive**。
2. **方式二**：用户自己在 Google Cloud 创建 **Web 应用** 客户端，在「高级」粘贴 ID/密钥（含完整分步教程）。自建 ID **优先于**内置客户端。

## 双通道（发行包内置）

1. **Chrome 扩展程序**客户端（`manifest.json` → `oauth2.client_id`）  
   方式一：启用 → **连接 Drive**。浏览器保持登录 Google 时自动续期。

2. **Web 应用**客户端（`builtin-oauth.ts`）+ **客户端密钥**（高级区可选）  
   再点一次「连接 Drive」后拿到 refresh token。即使浏览器退出 Google，上传仍可自动续期。

### 让所有用户都能用方式一

1. Google Cloud → [OAuth 同意屏幕 / 目标对象](https://console.cloud.google.com/apis/credentials/consent) → 发布状态改为 **正式版**（不要一直停在「测试中」；测试中只有测试用户能连）。
2. 权限范围只用 **Sensitive**（`drive.file`、`drive.metadata.readonly`），**不要**加 Restricted 的 `drive.readonly`（未验证会被整页拦截）。
3. 用户首次可能仍看到「应用未经验证」→ 点 **高级** → **继续前往 SafeCallRecorder** 即可。完整品牌验证可选。

更换内置客户端：

```bash
node scripts/bake-oauth-client.mjs --chrome <Chrome客户端ID>.apps.googleusercontent.com
node scripts/bake-oauth-client.mjs --web <Web客户端ID>.apps.googleusercontent.com
```

扩展 ID 固定：`bbmllidogccokoahnlmgehbikklpdcgd`。

## 方式二：用户自建（控制面板高级区）

1. 展开 **高级：自建 OAuth / 离线续期 / 导出配置**。
2. 按 **Google Cloud 详细配置教程**（步骤 0–5）创建 **Web 应用** 客户端。
3. 「已授权的重定向 URI」添加控制面板显示的  
   `https://<扩展ID>.chromiumapp.org/`（点「复制重定向 URI」）。
4. 粘贴客户端 ID（密钥可选，有密钥可长期自动续期）。
5. 点 **连接 Drive**。

详细分步与排错见插件帮助页「Google 云端上传」。

## 连接后

- 未选手动文件夹时，会自动创建/使用默认文件夹 `SafeCallRecorder`。
- 可随时「更换文件夹」。
- 「断开」只清登录；「清空云端配置」会清 ID / 密钥 / 文件夹。

## 换浏览器

导出 / 导入云端配置或全部设置。默认导出不含密钥与令牌；勾选敏感导出后可免重新登录。
