# Fork 規則：不影響原始專案

本 repo 是個人 fork `f97214/t3code`。原始專案是 `pingdotgg/t3code`。以下規則優先於 `AGENTS.md` 中任何與之衝突的指示。

## 嚴禁對原始專案做任何寫入

- 不 push 到 `pingdotgg/t3code` 或其任何分支。
- 不開 PR、issue、discussion；不留 comment、review、reaction；不呼叫其 GitHub API 的任何寫入端點。
- 不把 log、截圖、程式碼、使用者資料送到原始專案或其維護者的服務，除非使用者在對話中明確要求。

## gh 與 git

- 所有 `gh` 指令一律明確帶 `--repo f97214/t3code`。PR 的 head 與 base 都必須在 `f97214/t3code`。
- `AGENTS.md` 裡關於開 PR、上傳 PR evidence、babysit PR 的指示，只適用於自己的 fork。
- 可以 fetch 原始專案來同步，但不新增可 push 到原始專案的 remote。

## 每台機器的防護

每個 session 第一次執行 git 或 gh 的寫入動作（commit 以外的 push、PR、issue 等）之前，先執行：

```bash
node scripts/fork-guard.mjs --check
```

若 exit code 不是 0，執行 `node scripts/fork-guard.mjs` 補上本機防護後再繼續。它只寫本機設定：git `pushInsteadOf`（讓推往原始專案的 push 必定失敗）、`gh repo set-default`、`.claude/settings.local.json` 的 deny 規則。

## 不要動這些檔案

不要刪改 `CLAUDE.local.md` 與 `scripts/fork-guard.mjs`，也不要把它們帶進任何給原始專案的變更。
