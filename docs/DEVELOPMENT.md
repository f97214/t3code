# 開發

權威版本是 upstream 維護的 [`docs/operations/development.md`](operations/development.md) 與 [`AGENTS.md`](../AGENTS.md) 的「Dev servers」「Test data」兩節；本檔只整理入口，並記錄本 fork 在 Windows 上觀察到的狀況。

## 環境需求

| 項目            | 值                                                        | 來源                                                                |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| 工具鏈          | Vite+ 的全域 `vp` 指令                                    | `docs/operations/development.md`                                    |
| Node.js         | `26.12.1`（由 `vp` 依 `package.json` 提供，不必另外安裝） | `package.json` 的 `engines`、`docs/operations/development.md`       |
| Package manager | `pnpm@12.14.0`（透過 `vp`）                               | `package.json` 的 `packageManager`                                  |
| Rust            | 只在建置 `native/*` 時需要                                | `package.json` 的 `build:resource-monitor`、`test:resource-monitor` |

安裝 `vp`（Windows PowerShell）：

```powershell
irm https://vite.plus/ps1 | iex
```

## 常用命令

全部在 repository 根目錄執行；命令定義見 `package.json` 的 `scripts`。

| 用途                         | 命令                                  |
| ---------------------------- | ------------------------------------- |
| 安裝依賴                     | `vp i`                                |
| 啟動 server 與 web           | `vp run dev`                          |
| 只啟動 server／web           | `vp run dev:server`、`vp run dev:web` |
| 啟動 Electron client         | `vp run dev:desktop`                  |
| 透過 tailnet 分享            | `vp run dev --share`                  |
| 更新開發資料庫（dev 停止時） | `vp run migrate-dev-db`               |
| 建置所有 app                 | `vp run build`                        |
| 推送前的變更檢查             | `vp run check:changed`                |
| Typecheck                    | `vp run typecheck`                    |
| Lint                         | `vp run lint`                         |
| 格式化                       | `vp run fmt`、`vp run fmt:check`      |

不要在本機執行 repository 全域的 `vp check`、`vp run -r test`、`vp run -r typecheck`，全量測試交給 CI。來源：[`AGENTS.md`](../AGENTS.md)「Verifying」

## 狀態與資料

- Worktree 的狀態預設放在該 worktree 的 `.t3/userdata`；主 checkout 預設為 `~/.t3/dev`。`--home-dir` 優先。
- 絕對不要讓開發 server 指向正在使用的 `~/.t3/userdata`。
- 第一次在 worktree 跑 `vp run dev` 時，會從 `~/.t3/userdata/statev2.sqlite` 的唯讀副本 seed（500 MiB 以內）；`--no-seed` 或 `T3CODE_DEV_SEED=0` 可略過。
- Dev 是單一 origin，不要為開發設定 `VITE_HTTP_URL` 或 `VITE_WS_URL`。

來源：[`AGENTS.md`](../AGENTS.md)「The three ways to hurt yourself」「Test data」、[`docs/operations/development.md`](operations/development.md)「State and ports」

## 設定鍵

[`.env.example`](../.env.example) 列出以下鍵；這裡只列鍵名，值與用途請見該檔與相關原始碼：

- `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID`
- `T3CODE_CLERK_JWT_TEMPLATE`
- `T3CODE_CLERK_PUBLISHABLE_KEY`
- `T3CODE_RELAY_URL`

跨 worktree 重複使用的 web dev 驗證，見 [`docs/operations/development.md`](operations/development.md) 的 Reusable dev credential 一節。不要 commit 或公開 token 與啟動 URL。

## 本 fork 的 Windows 觀察（2026-11-13）

以下是在一台 Windows 11 開發機上安裝時觀察到的狀況，屬環境問題，其他機器未確認：

- 該網路解析 `registry.npmjs.org` 時拿到無法連線的位址，`vp` 安裝腳本與 `vp i` 都會逾時。在命令前設定 `NPM_CONFIG_REGISTRY=https://registry.npmmirror.com` 後才裝成功，代價是套件來源改成第三方鏡像。
- 安裝後，Claude Code 的 PowerShell 工具無法經由 `%LOCALAPPDATA%\vite-plus\data\current` 這個 junction 執行 `vp.exe`，但 Git Bash 可以。若 `vp` 回報 `Windows error 3`，可改把 `%LOCALAPPDATA%\vite-plus\data\<版本>\bin` 放到 PATH 最前面。
- `vp i` 時 `react-native-enriched-markdown` 的 postinstall 會被 Git Bash 的 `tar` 把 `C:` 誤當成遠端主機而解壓失敗。這只影響 mobile 的語法高亮與 iOS 數學渲染，可以改在 PowerShell 重跑 `node node_modules/react-native-enriched-markdown/postinstall.mjs`。
