// @effect-diagnostics nodeBuiltinImport:off - Builds a fake repo in a real temp dir.
import { assert, it } from "@effect/vitest";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { vi } from "vite-plus/test";

import { findMissing, findModuleCandidates, findStale, main } from "./i18n-overlay.ts";

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

const MODULE_SCOPE_LIST = "packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json";
const moduleArray = (label: string) => `export const OPTIONS = [{ id: "x", label: "${label}" }];\n`;

const withListedRepo = (
  files: Record<string, string>,
  list: { include: string[]; exclude: Record<string, string> },
  run: (root: string) => void,
  dictionary: Record<string, string> = {},
) => withRepo({ ...files, [MODULE_SCOPE_LIST]: JSON.stringify(list) }, dictionary, run);

it("module-candidates lists unlisted files with module-scope strings", () => {
  withListedRepo(
    {
      "apps/web/src/exportOptions.ts": `export const OPTIONS = [{ id: "csv", label: "Export as CSV" }];\n`,
      "apps/web/src/listed.ts": moduleArray("Listed label"),
      "apps/web/src/excluded.ts": moduleArray("Excluded label"),
      "apps/web/src/plain.ts": "export const n = 1;\n",
    },
    {
      include: ["apps/web/src/listed.ts"],
      exclude: { "apps/web/src/excluded.ts": "not user facing" },
    },
    (root) => {
      assert.deepStrictEqual(findModuleCandidates(root), {
        unlisted: [{ file: "apps/web/src/exportOptions.ts", count: 1, samples: ["Export as CSV"] }],
        missingListed: [],
      });
    },
  );
});

it("module-candidates lists listed paths that no longer exist", () => {
  withListedRepo(
    {},
    {
      include: ["apps/web/src/composerPlaceholder.ts"],
      exclude: { "apps/web/src/gone.ts": "reason" },
    },
    (root) => {
      assert.deepStrictEqual(findModuleCandidates(root).missingListed, [
        "apps/web/src/composerPlaceholder.ts",
        "apps/web/src/gone.ts",
      ]);
    },
  );
});

it("module-candidates skips unparsable files and caps samples at five", () => {
  const labels = ["a1", "a2", "a3", "a4", "a5", "a6", "a1"];
  withListedRepo(
    {
      "apps/web/src/broken.ts": `export const A = [{ label: "Broken label" }];\nconst = ;\n`,
      "apps/web/src/many.ts": `export const L = [${labels.map((l) => `{ label: "Label ${l}" }`).join(", ")}];\n`,
    },
    { include: [], exclude: {} },
    (root) => {
      const { unlisted } = findModuleCandidates(root);
      assert.strictEqual(unlisted.length, 1);
      assert.strictEqual(unlisted[0]?.file, "apps/web/src/many.ts");
      assert.deepStrictEqual(unlisted[0]?.samples, [
        "Label a1",
        "Label a2",
        "Label a3",
        "Label a4",
        "Label a5",
      ]);
    },
  );
});

it("missing includes module-scope keys from listed files", () => {
  withListedRepo(
    {
      "apps/web/src/listed.ts": moduleArray("Listed label"),
      "apps/web/src/translated.ts": moduleArray("Translated label"),
      "apps/web/src/unlisted.ts": moduleArray("Unlisted label"),
    },
    { include: ["apps/web/src/listed.ts", "apps/web/src/translated.ts"], exclude: {} },
    (root) => {
      assert.deepStrictEqual(
        findMissing(root, "zh-TW").missing.map((entry) => entry.key),
        ["Listed label"],
      );
      assert.deepStrictEqual(findStale(root, "zh-TW").stale, ["Unlisted label"]);
    },
    { "Translated label": "已翻譯", "Unlisted label": "未列入" },
  );
});

it.each([
  ["broken JSON", "{include:"],
  ["include not an array", '{"include":"x"}'],
])("main exits 2 naming the list when it has %s", (_name, text) => {
  withRepo({ [MODULE_SCOPE_LIST]: text }, {}, (root) => {
    using write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    assert.strictEqual(main(["missing", "--locale", "zh-TW"], root), 2);
    assert.strictEqual(write.mock.calls.length, 1);
    assert.include(String(write.mock.calls[0]?.[0]), "moduleScopeFiles.json");
  });
});

it("main rejects extra arguments for module-candidates", () => {
  using write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  assert.strictEqual(main(["module-candidates", "--locale", "zh-TW"]), 2);
  assert.include(String(write.mock.calls[0]?.[0]), "module-candidates");
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
