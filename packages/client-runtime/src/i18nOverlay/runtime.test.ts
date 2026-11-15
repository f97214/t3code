import { describe, expect, it, vi } from "vite-plus/test";

import {
  __t,
  __ts,
  __tx,
  loadOverlayDictionary,
  registerOverlayDictionary,
  setOverlayLocale,
} from "./runtime.ts";

const setup = (locale: string, dictionary: Record<string, string> = {}) => {
  setOverlayLocale("en");
  registerOverlayDictionary("zh-TW", dictionary);
  setOverlayLocale(locale);
};

describe("overlay runtime lookup", () => {
  it("returns the translation for the active locale", () => {
    setup("zh-TW", { "Save changes": "儲存變更" });
    expect(__t("Save changes")).toBe("儲存變更");
  });

  it("falls back to source text when the key is missing", () => {
    setup("zh-TW", { "Save changes": "儲存變更" });
    expect(__t("Codex")).toBe("Codex");
  });

  it("returns source text for English without a dictionary", () => {
    setup("en", { "Save changes": "儲存變更" });
    expect(__t("Save changes")).toBe("Save changes");
    setOverlayLocale("en-GB");
    expect(__t("Save changes")).toBe("Save changes");
  });

  it("unknown locale resolves without loading", async () => {
    setup("fr");
    await expect(loadOverlayDictionary("fr")).resolves.toBeUndefined();
    expect(__t("Save changes")).toBe("Save changes");
  });

  it("loads the zh-TW dictionary without throwing", async () => {
    setOverlayLocale("en");
    await expect(loadOverlayDictionary("zh-TW")).resolves.toBeUndefined();
    await expect(loadOverlayDictionary("zh-TW")).resolves.toBeUndefined();
    setOverlayLocale("zh-TW");
    expect(__t("Pin thread")).toBe("釘選執行緒");
  });
});

describe("overlay runtime placeholders", () => {
  it("reorders and omits placeholders", () => {
    setup("zh-TW", {
      "Delete {0} file{1}": "刪除 {0} 個檔案",
      "{0} of {1}": "{1} 中的 {0}",
    });
    expect(__ts("Delete {0} file{1}", [3, "s"])).toBe("刪除 3 個檔案");
    expect(__ts("{0} of {1}", [2, 5])).toBe("5 中的 2");
    expect(__ts("No placeholders", [1])).toBe("No placeholders");
  });

  it("places element values in placeholder positions", () => {
    setup("zh-TW", { "Open {0} now": "現在開啟 {0}" });
    const element = { type: "b" };
    const result = __tx("Open {0} now", [element]);
    expect(result).toEqual(["現在開啟 ", element, ""].filter((part) => part !== ""));
    expect(result[1]).toBe(element);
    expect(__tx("Open {0} now", [element])).toHaveLength(2);
  });
});

describe("overlay dictionary load failure", () => {
  it("stays English without throwing, then loads on retry", async () => {
    vi.resetModules();
    let fail = true;
    vi.doMock("./dictionaries/zh-TW.json", () => {
      if (fail) throw new Error("chunk load failed");
      return { default: { "Pin thread": "釘選執行緒" } };
    });
    try {
      const overlay = await import("./runtime.ts");
      overlay.setOverlayLocale("zh-TW");

      await expect(overlay.loadOverlayDictionary("zh-TW")).resolves.toBeUndefined();
      expect(overlay.__t("Pin thread")).toBe("Pin thread");

      fail = false;
      await expect(overlay.loadOverlayDictionary("zh-TW")).resolves.toBeUndefined();
      expect(overlay.__t("Pin thread")).toBe("釘選執行緒");
    } finally {
      vi.doUnmock("./dictionaries/zh-TW.json");
    }
  });
});
