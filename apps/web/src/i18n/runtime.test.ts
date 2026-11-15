import { describe, expect, it, vi } from "vite-plus/test";

type Translations = Record<string, Record<string, string>>;

const mocks = vi.hoisted(() => ({
  language: "en",
  listeners: new Set<() => void>(),
  gtLoads: [] as Array<{ locale: string; resolve: (value: Translations) => void }>,
  failDictionary: false,
  registered: new Set<string>(),
}));

// importOriginal keeps one overlay instance across vi.resetModules, so readiness is tracked per test.
vi.mock("@t3tools/client-runtime/i18n-overlay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@t3tools/client-runtime/i18n-overlay")>();
  return {
    ...actual,
    hasOverlayDictionary: (locale: string) => mocks.registered.has(locale),
    loadOverlayDictionary: async (locale: string) => {
      if (mocks.failDictionary) return;
      await actual.loadOverlayDictionary(locale);
      mocks.registered.add(locale);
    },
  };
});

vi.mock("gt-react", () => ({
  getTranslationsSnapshot: (locale: string) =>
    new Promise<Translations>((resolve) => {
      mocks.gtLoads.push({ locale, resolve });
    }),
}));

vi.mock("../hooks/useSettings", () => ({
  getClientSettings: () => ({ language: mocks.language }),
  subscribeClientSettings: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
  updateClientSettings: vi.fn(),
}));

vi.mock("./initializeI18n", () => ({ initializeI18n: vi.fn() }));

// Uses the real zh-TW dictionary ("Pin thread" -> "釘選執行緒"), loaded through the real overlay.
const setup = async (language: string) => {
  mocks.language = language;
  mocks.listeners.clear();
  mocks.gtLoads.length = 0;
  mocks.failDictionary = false;
  mocks.registered.clear();
  vi.stubGlobal("document", { documentElement: { lang: "" } });
  vi.stubGlobal("navigator", { languages: [] });
  vi.resetModules();
  const overlay = await import("@t3tools/client-runtime/i18n-overlay");
  overlay.setOverlayLocale("en");
  const runtime = await import("./runtime");
  return { overlay, runtime };
};

const resolveGtLoad = (locale: string) => {
  const load = mocks.gtLoads.find((entry) => entry.locale === locale);
  if (!load) throw new Error(`no pending GT load for ${locale}`);
  load.resolve({ [locale]: { greeting: "hello" } });
};

describe("web locale activation", () => {
  it("switches the overlay only after translations and dictionary are ready", async () => {
    const { overlay, runtime } = await setup("zh-TW");
    runtime.startI18n();
    const ready = runtime.whenLocaleReady();

    await overlay.loadOverlayDictionary("zh-TW");
    expect(overlay.__t("Pin thread")).toBe("Pin thread");
    expect(runtime.getI18nSnapshot().locale).toBe("en");

    resolveGtLoad("zh-TW");
    await ready;
    expect(overlay.__t("Pin thread")).toBe("釘選執行緒");
    expect(runtime.getI18nSnapshot().locale).toBe("zh-TW");
  });

  it("ignores a superseded request that finishes after the language changed", async () => {
    const { overlay, runtime } = await setup("zh-TW");
    runtime.startI18n();
    const stale = runtime.whenLocaleReady();
    await overlay.loadOverlayDictionary("zh-TW");

    mocks.language = "en";
    for (const listener of mocks.listeners) listener();
    await runtime.whenLocaleReady();
    expect(runtime.getI18nSnapshot().locale).toBe("en");

    resolveGtLoad("zh-TW");
    await stale;
    expect(overlay.__t("Pin thread")).toBe("Pin thread");
    expect(runtime.getI18nSnapshot().locale).toBe("en");
  });

  it("notifies once when a failed dictionary load succeeds on retry", async () => {
    const { runtime } = await setup("zh-TW");
    mocks.failDictionary = true;
    runtime.startI18n();
    resolveGtLoad("zh-TW");
    await runtime.whenLocaleReady();
    expect(runtime.getI18nSnapshot()).toMatchObject({ locale: "zh-TW", overlayReady: false });

    const listener = vi.fn();
    runtime.subscribeI18n(listener);
    mocks.failDictionary = false;
    await runtime.whenLocaleReady();
    expect(runtime.getI18nSnapshot().overlayReady).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify again while the dictionary is still unavailable", async () => {
    const { runtime } = await setup("zh-TW");
    mocks.failDictionary = true;
    runtime.startI18n();
    resolveGtLoad("zh-TW");
    await runtime.whenLocaleReady();

    const listener = vi.fn();
    runtime.subscribeI18n(listener);
    await runtime.whenLocaleReady();
    expect(listener).not.toHaveBeenCalled();
    expect(runtime.getI18nSnapshot().overlayReady).toBe(false);
  });
});
