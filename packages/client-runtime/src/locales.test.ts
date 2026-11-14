import { describe, expect, it } from "vite-plus/test";

import { resolveLocale } from "./locales.ts";

const SUPPORTED = ["en", "ja", "pt-BR", "zh", "zh-TW"];

describe("resolveLocale", () => {
  it.each([
    [["zh-TW"], "zh-TW"],
    [["zh-Hant-TW"], "zh-TW"],
    [["zh-HK"], "zh-TW"],
    [["zh_TW"], "zh-TW"],
    [["zh-CN"], "zh"],
    [["zh-Hans"], "zh"],
    [["zh"], "zh"],
  ])("system %j resolves to %s", (systemLocales, expected) => {
    expect(resolveLocale("system", systemLocales, SUPPORTED, "en")).toBe(expected);
  });

  it("never sends Traditional tags to Simplified when zh-TW is unsupported", () => {
    expect(resolveLocale("system", ["zh-TW", "ja"], ["en", "ja", "zh"], "en")).toBe("ja");
  });

  it("keeps an explicitly saved supported locale", () => {
    expect(resolveLocale("zh-TW", ["en-US"], SUPPORTED, "en")).toBe("zh-TW");
  });
});
