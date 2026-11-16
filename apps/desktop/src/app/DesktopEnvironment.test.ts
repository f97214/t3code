import * as NodePath from "@effect/platform-node/NodePath";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const layerEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(
    Layer.provide(
      Layer.mergeAll(NodeServices.layer, NodePath.layerPosix, DesktopConfig.layerTest(env)),
    ),
  );

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) => DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(layerEnvironment(overrides, env)));

describe("DesktopEnvironment", () => {
  it.effect("uses the packaged Windows server sidecar as the backend root", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({
        platform: "win32",
        isPackaged: true,
        appPath: "/install/resources/app.asar",
        resourcesPath: "/install/resources",
      });

      assert.equal(environment.appRoot, "/install/resources/app.asar");
      assert.equal(environment.serverRoot, "/install/resources/server.asar");
      assert.equal(
        environment.backendEntryPath,
        "/install/resources/server.asar/apps/server/dist/bin.mjs",
      );
      assert.equal(
        environment.clientAssetsDir,
        "/install/resources/server.asar/apps/server/dist/client",
      );
    }),
  );

  it.effect("keeps implicit development state separate from production state", () =>
    Effect.gen(function* () {
      const development = yield* makeEnvironment(
        {},
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      const production = yield* makeEnvironment();

      assert.equal(development.stateDir, "/Users/alice/.t3/dev");
      assert.equal(production.stateDir, "/Users/alice/.t3/userdata");
    }),
  );

  it.effect("keeps portable state beside the executable, ignoring T3CODE_HOME", () =>
    Effect.gen(function* () {
      const portableInput = {
        platform: "win32",
        isPackaged: true,
        appPath: "/portable/resources/app.asar",
        resourcesPath: "/portable/resources",
        portableRoot: Option.some("/portable"),
      } as const;
      const portable = yield* makeEnvironment(portableInput, {
        T3CODE_HOME: "/Users/alice/.t3",
        APPDATA: "/Users/alice/AppData/Roaming",
      });
      const overridden = yield* makeEnvironment(portableInput, {
        T3CODE_DESKTOP_APP_USER_MODEL_ID: "custom.id",
      });
      const installed = yield* makeEnvironment({ platform: "win32", isPackaged: true });

      assert.isTrue(portable.isPortable);
      assert.equal(portable.baseDir, "/portable/data");
      assert.equal(portable.stateDir, "/portable/data/userdata");
      assert.equal(portable.appDataDirectory, "/portable/data/electron");
      assert.equal(portable.appUserModelId, "com.t3tools.t3code.portable");
      assert.equal(overridden.appUserModelId, "custom.id");
      assert.isFalse(installed.isPortable);
      assert.equal(installed.appUserModelId, "com.t3tools.t3code");
    }),
  );
});
