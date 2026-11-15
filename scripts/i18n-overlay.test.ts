// @effect-diagnostics nodeBuiltinImport:off - Builds a fake repo in a real temp dir.
import { assert, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { vi } from "vite-plus/test";

import { findMissing, findStale, main } from "./i18n-overlay.ts";

const DICTIONARY_DIR = "packages/client-runtime/src/i18nOverlay/dictionaries";

const withRepo = (
  files: Record<string, string>,
  dictionary: Record<string, string>,
  run: (root: string) => void,
) => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "i18n-overlay-"));
  try {
    for (const [relative, content] of Object.entries(files)) {
      const target = NodePath.join(root, relative);
      NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
      NodeFS.writeFileSync(target, content);
    }
    NodeFS.mkdirSync(NodePath.join(root, DICTIONARY_DIR), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(root, DICTIONARY_DIR, "zh-TW.json"),
      JSON.stringify(dictionary),
    );
    run(root);
  } finally {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
};

const webFiles = {
  "apps/web/src/components/Logs.tsx": "export const A = () => <span>Export logs</span>;\n",
  "apps/web/src/components/settings/Panel.tsx":
    "export const B = () => (\n  <div>\n    <span>Export logs</span>\n    <span>Save</span>\n  </div>\n);\n",
  "apps/mobile/src/Screen.tsx": "export const C = () => <span>Mobile only</span>;\n",
};

it("missing lists keys absent from the dictionary with their files", () => {
  withRepo(webFiles, { Save: "儲存" }, (root) => {
    assert.deepStrictEqual(findMissing(root, "zh-TW"), {
      locale: "zh-TW",
      missing: [
        {
          key: "Export logs",
          files: [
            "apps/web/src/components/Logs.tsx:1",
            "apps/web/src/components/settings/Panel.tsx:3",
          ],
        },
        { key: "Mobile only", files: ["apps/mobile/src/Screen.tsx:1"] },
      ],
    });
  });
});

it("stale lists dictionary keys no longer in source", () => {
  withRepo(webFiles, { Save: "儲存", "Old key": "舊" }, (root) => {
    assert.deepStrictEqual(findStale(root, "zh-TW"), { locale: "zh-TW", stale: ["Old key"] });
  });
});

it("--under limits the scan", () => {
  withRepo(webFiles, { Save: "儲存" }, (root) => {
    assert.deepStrictEqual(findMissing(root, "zh-TW", "apps/web/src/components/settings"), {
      locale: "zh-TW",
      missing: [{ key: "Export logs", files: ["apps/web/src/components/settings/Panel.tsx:3"] }],
    });
  });
});

it.each([
  ["unknown subcommand", ["bogus", "--locale", "zh-TW"]],
  ["missing --locale", ["missing"]],
  ["unknown flag", ["missing", "--locale", "zh-TW", "--bogus", "x"]],
])("main rejects %s with exit code 2 and usage", (_name, argv) => {
  using write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  assert.strictEqual(main(argv), 2);
  assert.strictEqual(write.mock.calls.length, 1);
  assert.include(String(write.mock.calls[0]?.[0]), "Usage:");
});
