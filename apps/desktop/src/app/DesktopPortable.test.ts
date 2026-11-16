import { assert, describe, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { resolvePortableRoot } from "./DesktopPortable.ts";

const resolve = (
  packageJson: string | undefined,
  overrides: { readonly isPackaged?: boolean; readonly platform?: NodeJS.Platform } = {},
) =>
  resolvePortableRoot({
    isPackaged: overrides.isPackaged ?? true,
    platform: overrides.platform ?? "win32",
    appPath: "/portable/resources/app.asar",
    execPath: "/portable/T3 Code (Beta).exe",
    joinPath: (...segments) => segments.join("/"),
    dirname: (path) => path.slice(0, path.lastIndexOf("/")),
    readFile: (path) =>
      path === "/portable/resources/app.asar/package.json" ? packageJson : undefined,
  });

describe("resolvePortableRoot", () => {
  it("returns the executable's folder only for a packaged Windows build flagged portable", () => {
    const flagged = JSON.stringify({ name: "t3code", t3codePortable: true });

    assert.deepStrictEqual(resolve(flagged), Option.some("/portable"));
    assert.deepStrictEqual(resolve(JSON.stringify({ name: "t3code" })), Option.none());
    assert.deepStrictEqual(resolve("{not json"), Option.none());
    assert.deepStrictEqual(resolve(undefined), Option.none());
    assert.deepStrictEqual(resolve(flagged, { isPackaged: false }), Option.none());
    assert.deepStrictEqual(resolve(flagged, { platform: "darwin" }), Option.none());
  });
});
