---
paths:
  - "docs/spectra/changes/**"
---
<!-- bootstrap-ai-project:spectra-team sha256=dadbd2f262566d7c7366ffa78e9ed08043cabf393e4f5f0b44823c1d5c5bd8f8 -->
# Spectra 變更的角色分工

處理 `<spec_dir>/changes/<name>/`（`spec_dir` 見 `.spectra.yaml`，沒設定時為 `openspec`）的 `/spectra-apply` 與 `/spectra-review` 時適用。沒有 `.claude/agents/` 角色可用時整節不適用，主代理照原流程自己完成。

主代理是 Lead：選 change、執行 `spectra` CLI、`spectra task start`／`spectra task done`、回讀 diff 與驗證證據、決定下一步與最終回報。實作、調查與審查交給角色，Lead 不自己寫程式或文件。

## 委派方式

- 用 Agent 工具的 agent type 指定角色：`explorer`、`implementer`、`doc-writer`、`test-engineer`、`reviewer`。
- **repository 調查一律派 `explorer`**，不要用內建的 `Explore`：角色帶得動契約範圍與排除項目，內建的帶不動，而且它繼承主 session 的 model。需要方案比較或設計取捨時才用內建的 `Plan`。
- 只有要**同時**派多個 worker 時才替它們命名，而且必須在同一則訊息裡一次發出所有委派；只派一位時不要命名。命名後的角色會成為 teammate，做完要收掉。
- 不在 prompt 指定 model 或 effort，沿用角色定義的設定。
- 每次委派都附上 `spectra-apply` 的 worker packet：task ID 與完整描述、可寫路徑、該 task 的 Implementation Contract 摘錄、相關 Requirement／Scenario／Example、驗證命令、TDD 與 audit 旗標。
- 明確要求角色：不得執行 `spectra task start`／`spectra task done`，不得修改 `tasks.md`、`design.md`、`proposal.md`；回報 touched files、每個驗證命令與退出碼、未解決的 blocker。
- 角色不存在或委派失敗時，Lead 才自行完成該 task，並在回報中說明原因。

## 每個 task

1. Lead 執行 `spectra task start`，讀該 task 的 Implementation Contract。
2. 需要定位程式碼、呼叫關係或既有 pattern，而 `design.md` 沒寫清楚時，先派 `explorer`；多個調查問題可同時派多個。
3. 依 task 內容派一個 writer：
   - 以文件為主（`*.md`、對照表、變更紀錄）→ `doc-writer`
   - 程式碼、腳本或設定 → `implementer`；`tdd: true` 時由它在同一個 task 內完成 RED → GREEN，並回報 RED 的失敗證據
   - 只補測試或處理測試基礎設施 → `test-engineer`
4. Lead 回讀 writer 實際修改的檔案與 diff，核對驗證命令的退出碼；不符 Implementation Contract 時把具體差異退回同一角色重做，最多兩輪，仍不通過就依 `spectra-apply` 的 blocker 規則停下回報。
5. 通過後 Lead 執行 `spectra task done`，逐一帶上 writer 回報的檔案。

## 檔案歸屬

`spectra task start` 回傳 `git_tracking_available: false` 時，`--file` 不會被記錄下來（常見成因是 `spec_dir` 與 git repo 不同層）。此時改在變更目錄的 `evidence/touched-by-task.md` 逐任務留下檔案清單，並在最終回報說明 spectra 沒有記錄歸屬，`/spectra-commit` 需要自行判斷範圍。

## 平行寫入

- 可寫路徑事先確定且互不重疊的 task，才可以同時各派一個 writer；有重疊、路徑無法事先確定，或偵測到其他人正在改同一批檔案時，依序派。
- 平行時在每個 packet 註明「Lead 已確認本 task 與其他 writer 的可寫路徑不重疊，授權平行寫入」，每個 writer 只驗證自己的範圍。
- 整組完成後，Lead 跑一次涵蓋整組的驗證命令，再逐一 `spectra task done`。
- `explorer` 與 `reviewer` 是唯讀角色，隨時可以平行。

## 收尾審查

所有 task 完成後、回報完成前**必須**跑這一步，不可略過：

1. 派 `reviewer`：範圍是本次 change 的 touched files，契約來源是 `proposal.md`、`design.md` 與 delta specs，驗證命令沿用 `tasks.md` 列出的命令，並附上失敗模式（見下段）。
2. Lead 依 severity 逐項判斷 findings：
   - `important`：採納的交回原 writer 角色修正並重新回讀；不採納的在回報中寫明理由。
   - `nit`：Lead 自行決定是否修，不因 nit 而重跑複審。
   - `pre-existing`：不交給 writer 修，也不擋本次 change；列在回報中，由使用者決定是否另開 change。
3. 有 `important` 被修正時派 `reviewer` 複審，附上上一輪 findings 與處置，範圍是修正後的新 diff。收尾審查含第一輪最多三輪；第三輪仍有 `important` 就停下回報使用者，不跑第四輪。
4. `tdd: true` 且有 spec scenario 沒有測試時，派 `test-engineer` 補。
5. 回報時列出每個 task 由哪個角色完成、reviewer 的 findings 與處置、跑了幾輪，再依 `spectra-apply` 建議 `/spectra-verify` 與 `/spectra-review`。

執行 `/spectra-review` 時，逐檔或逐面向的審查同樣交給 `reviewer`（可平行多個），packet 同樣附上失敗模式，Lead 負責彙整與結論。

### 失敗模式

失敗模式是這個專案或本次 change 最不能出的錯。它告訴 reviewer 先查什麼，不然 reviewer 只拿得到規格，看不出哪類錯誤在這裡最致命。

- 列 1–5 項，每項寫成看 diff 就能檢查的句子，例如「設定鍵改名但呼叫端沒跟著改」「文件描述的行為和實作不符」。
- 每項附來源：`AGENTS.md` 的界線、`accepted` 的 ADR、`CONTEXT.md` 標為避免的用詞、`proposal.md` 的非目標，或 `design.md` 的決策。
- 找不到依據就寫「未指定」，不要臆造。
