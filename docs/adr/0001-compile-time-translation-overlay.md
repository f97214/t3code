---
Status: proposed
---

# fork 的介面翻譯採編譯期 overlay，不逐檔包 gt-react

上游用 gt-react 做多語系，要在元件裡包 `<T>`／`useGT`，目前只翻了設定頁。這個 fork 需要整個 app 的繁體中文，但又要能經常同步上游。

因此我們決定在建置時把介面英文字串改寫成查字典的呼叫，字典是以英文原文為 key 的獨立 JSON，元件原始碼不改。逐檔包 `<T>` 會改到上千個檔案，每次同步都會衝突；執行期替換 DOM 則無法用在 React Native，也可能誤翻聊天內容。

代價是 overlay 與上游的 gt-react 會並存：上游已經包起來的字串仍由 gt-react 翻譯，overlay 會跳過 `<T>` 的內容。

來源：Spectra change `add-zh-tw-i18n-overlay`（設計細節見其 design.md）。
