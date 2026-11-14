# 功能

本表只列 repository 中有使用者文件或原始碼證據的能力，並連到 upstream 維護的使用者指南；指南才是各功能用法的權威來源。「狀態」只表示文件存在，是否已在本 fork 的建置中實際驗證則標為「未確認」。

來源：[`docs/README.md`](README.md)、`docs/user/`

## 核心

| 能力                       | 指南                                             | 狀態                   |
| -------------------------- | ------------------------------------------------ | ---------------------- |
| 安裝                       | [install](user/install.md)                       | 有文件；本 fork 未確認 |
| 訊息與 context（composer） | [composer](user/composer.md)                     | 有文件；本 fork 未確認 |
| Thread 管理                | [thread-sidebar](user/thread-sidebar.md)         | 有文件；本 fork 未確認 |
| 權限模式                   | [permission-modes](user/permission-modes.md)     | 有文件；本 fork 未確認 |
| 終端機紀錄                 | [terminal](user/terminal.md)                     | 有文件；本 fork 未確認 |
| Source control             | [source-control](user/source-control.md)         | 有文件；本 fork 未確認 |
| 專案設定                   | [project-settings](user/project-settings.md)     | 有文件；本 fork 未確認 |
| 外觀與主題                 | [appearance](user/appearance.md)                 | 有文件；本 fork 未確認 |
| 鍵盤快捷鍵                 | [keybindings](user/keybindings.md)               | 有文件；本 fork 未確認 |
| 語音輸入                   | [voice-input](user/voice-input.md)               | 有文件；本 fork 未確認 |
| 文字生成模型               | [text-generation](user/text-generation.md)       | 有文件；本 fork 未確認 |
| SnapShots                  | [snap-shot](user/snap-shot.md)                   | 有文件；本 fork 未確認 |
| 視覺化回覆                 | [html-renders](user/html-renders.md)             | 有文件；本 fork 未確認 |
| 匯入瀏覽器 session         | [browser-import](user/browser-import.md)         | 有文件；本 fork 未確認 |
| 設為預設瀏覽器             | [default-browser](user/default-browser.md)       | 有文件；本 fork 未確認 |
| 用量與限制                 | [usage](user/usage.md)                           | 有文件；本 fork 未確認 |
| Secrets（含 1Password）    | [secrets](user/secrets.md)                       | 有文件；本 fork 未確認 |
| 產品使用資料               | [telemetry](user/telemetry.md)                   | 有文件；本 fork 未確認 |
| 背景服務                   | [background-service](user/background-service.md) | 有文件；本 fork 未確認 |
| 更新                       | [updating](user/updating.md)                     | 有文件；本 fork 未確認 |
| 回報問題                   | [triage](user/triage.md)                         | 有文件；本 fork 未確認 |

## 遠端與多裝置

| 能力                     | 指南                                                             | 狀態                   |
| ------------------------ | ---------------------------------------------------------------- | ---------------------- |
| 遠端存取                 | [remote-access](user/remote-access.md)                           | 有文件；本 fork 未確認 |
| 裝置                     | [devices](user/devices.md)                                       | 有文件；本 fork 未確認 |
| Guest links              | [guest-links](user/guest-links.md)                               | 有文件；本 fork 未確認 |
| T3 Connect 疑難排解      | [t3-connect-troubleshooting](user/t3-connect-troubleshooting.md) | 有文件；本 fork 未確認 |
| 外部 agent 透過 MCP 操作 | [outside-agents](user/outside-agents.md)                         | 有文件；本 fork 未確認 |

## Provider

`AGENTS.md` 列出的 provider：Codex、Claude Code、Cursor、Grok、OpenCode、Antigravity、Kiro、Pi、Muse Code、fx，另有 ACP Registry。各自的 adapter 在 `packages/provider-*` 與 `apps/server`。

| Provider     | 指南                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| Codex        | [providers-codex](user/providers-codex.md)                             |
| Claude       | [providers-claude](user/providers-claude.md)                           |
| Cursor       | [cursor](user/cursor.md)                                               |
| OpenCode     | [providers-opencode](user/providers-opencode.md)                       |
| Antigravity  | [providers-antigravity](user/providers-antigravity.md)                 |
| Kiro         | [providers-kiro](user/providers-kiro.md)                               |
| Pi           | [providers-pi](user/providers-pi.md)                                   |
| Muse Code    | [providers-muse](user/providers-muse.md)                               |
| fx           | [providers-fx](user/providers-fx.md)                                   |
| ACP Registry | [providers-acp](user/providers-acp.md)                                 |
| Grok         | 未確認：`docs/user/` 沒有專屬指南；adapter 在 `packages/provider-grok` |

來源：[`AGENTS.md`](../AGENTS.md)「Hit every surface」、`packages/provider-*`
