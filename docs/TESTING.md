# 測試

撰寫測試的規則以 upstream 維護的 [`docs/internals/testing.md`](internals/testing.md) 與 [`AGENTS.md`](../AGENTS.md)「Verifying」為準；本檔只整理框架、位置與命令。

## 框架與位置

| 類型           | 框架                              | 位置與命名                                                                        | 來源                                                      |
| -------------- | --------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Unit／整合測試 | Vitest（透過 Vite+ 的 `vp test`） | 與原始碼並排的 `*.test.ts`、`*.test.tsx`；repository 內約 6,200 個                | `package.json`、`git ls-files`                            |
| Web 瀏覽器測試 | Vitest browser mode               | `*.browser.test.ts(x)`，以 `apps/web/test/render.tsx` 的 `render` 渲染；約 194 個 | `docs/internals/testing.md`、`git ls-files`               |
| 元件呼叫的邏輯 | Vitest                            | 元件旁的 `*.logic.test.ts`                                                        | `docs/internals/testing.md`                               |
| Rust 原生元件  | `cargo test`                      | `native/resource-monitor`                                                         | `package.json` 的 `test:resource-monitor`                 |
| 真實 app 驗證  | Scenarios                         | `vp run scenarios:prove`                                                          | [`docs/operations/scenarios.md`](operations/scenarios.md) |

## 命令

| 用途           | 命令                                          | 來源                                    |
| -------------- | --------------------------------------------- | --------------------------------------- |
| 跑指定測試檔   | `vp test run <files>`（大檔加 `-t "<name>"`） | `AGENTS.md`「Verifying」                |
| 推送前檢查變更 | `vp run check:changed`                        | `AGENTS.md`、`scripts/check-changed.ts` |
| Rust 原生元件  | `vp run test:resource-monitor`                | `package.json`                          |

不要在本機跑 `vp run -r test` 或 `vp check`，完整測試套件由 CI（`.github/workflows/ci.yml`、`windows-tests.yml`）執行。

## 重點規則摘要

- 測試會壞掉的行為，例如 orchestration、provider 協定轉譯、權限檢查、持久化與 migration、競態修正。型別已經保證的事、文案、smoke run 不必測。
- 先擴充既有測試或表格，沒有適合的案例才新增 `it`。
- 只在最低一層、也就是在 `main` 上會失敗的那一層測試。
- 不用 sleep、輪詢或逾時參數：drain effect worker（`OrchestrationEffectWorkerV2.drain`），或 await 特定的 event／`Deferred`。lint 規則會強制這點。
- Bug 修正：邏輯／資料／協定類先寫會失敗的測試；純視覺問題用前後截圖，不加 UI 測試。

## Spectra

本 repository 的 `.spectra.yaml` 設定 `spec_dir: docs/spectra` 與 `tdd: true`。在 `docs/spectra/changes/` 下的 change 以 `/spectra-apply` 實作時採 TDD 流程；`docs/spectra/config.yaml` 是 Spectra 產生 artifact 時讀取的專案設定。

來源：`.spectra.yaml`、`docs/spectra/config.yaml`
