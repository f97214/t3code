import type { NavigationState } from "@react-navigation/native";
import { assert, it } from "@effect/vitest";
import { vi } from "vite-plus/test";

const loadModule = async (ready: boolean, state: NavigationState) => {
  vi.resetModules();
  vi.doMock("../lib/rootNavigation", () => ({
    rootNavigationRef: { isReady: () => ready, getRootState: () => state },
  }));
  return import("./overlayNavigationState");
};

const savedState = { key: "saved", index: 0, routes: [] } as unknown as NavigationState;

it("does not save on the first rendered locale", async () => {
  const mod = await loadModule(true, savedState);
  mod.noteRenderedLocale("en");
  assert.isUndefined(mod.takeOverlayNavigationState());
});

it("saves the root state once when the locale changes while navigation is ready", async () => {
  const mod = await loadModule(true, savedState);
  mod.noteRenderedLocale("en");
  mod.noteRenderedLocale("zh-TW");
  assert.strictEqual(mod.takeOverlayNavigationState(), savedState);
  assert.isUndefined(mod.takeOverlayNavigationState());
});

it("does not save when the locale is unchanged", async () => {
  const mod = await loadModule(true, savedState);
  mod.noteRenderedLocale("en");
  mod.noteRenderedLocale("en");
  assert.isUndefined(mod.takeOverlayNavigationState());
});

it("does not save when the locale changes before navigation is ready", async () => {
  const mod = await loadModule(false, savedState);
  mod.noteRenderedLocale("en");
  mod.noteRenderedLocale("zh-TW");
  assert.isUndefined(mod.takeOverlayNavigationState());
});
