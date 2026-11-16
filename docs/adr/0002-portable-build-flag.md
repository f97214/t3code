---
Status: proposed
---

# Windows 免安裝版以打包旗標觸發，在 DesktopEnvironment 改寫路徑

fork 需要一個解壓即用、資料都放在 exe 旁邊的 Windows 桌面版。我們決定由 `dist:desktop:win:portable`（Windows `zip` target）在 asar 內的 `package.json` 寫入 `t3codePortable: true`，並且不放更新 feed。app 啟動時同步讀到這個旗標，就在 `DesktopEnvironment.make` 把 T3 home 和 Chromium userData 改到 `<exe>\data`，忽略環境裡原有的 `T3CODE_HOME`，並換一個 Windows AppUserModelID（AUMID，決定工作列分組與通知歸屬），避免和已安裝版混在一起。這種 build 的後端子程序會剝除 `T3CODE_HOME`，自動更新一律停用；首次啟動也不會自動寫 PATH，使用者仍可在 Settings → About 手動安裝 `t3`。

## 否決的方案

- **electron-builder 的 `portable` target**：每次啟動都要解壓到 `%TEMP%`，啟動慢，`execPath` 也會一直變，導致 `t3.cmd` 指向失效的路徑。
- **用啟動器設定 `APPDATA` 或 `T3CODE_HOME` 環境變數**：主後端以 `extendEnv` 繼承整個環境，這些值會傳給 server 和 provider，影響同一台機器上的已安裝版。
- **在 exe 旁放外部標記檔**：被刪除或漏複製時，會靜默退回已安裝版的 `~/.t3` 與 `%APPDATA%`，資料會被兩邊共用。

## 後果

- 資料夾佈局（`data\userdata`、`data\electron`）一旦有使用者在用，就很難再改。
- 要同步上游時，以下幾處是 fork 專屬的分支：
  - `DesktopEnvironment`
  - `DesktopBackendConfiguration`
  - `DesktopCliShim`
  - `DesktopCliCommand`
  - `DesktopUpdates`
  - `build-desktop-artifact`

來源：免安裝版規劃（對話中的需求訪談與三輪對抗審查）。
