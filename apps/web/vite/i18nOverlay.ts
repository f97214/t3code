// @effect-diagnostics-next-line nodeBuiltinImport:off -- Vite plugin runs before any Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeURL from "node:url";

import {
  isOverlaySourceFile,
  parseModuleScopeList,
  transformSource,
} from "@t3tools/client-runtime/i18n-overlay/transform";
import { parseSync, type Plugin } from "vite-plus";

const MODULE_SCOPE_FILES_URL = new URL(
  "../../../packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json",
  import.meta.url,
);

function readModuleScopeFiles(isServe: boolean): readonly string[] {
  const listPath = NodeURL.fileURLToPath(MODULE_SCOPE_FILES_URL);
  try {
    const list = parseModuleScopeList(NodeFS.readFileSync(listPath, "utf8"));
    if (list !== null) return list.include;
  } catch {}
  if (isServe) console.warn(`[t3code] i18n overlay module-scope list unreadable: ${listPath}`);
  return [];
}

export function i18nOverlayPlugin(srcDir: URL): Plugin {
  const srcRoot = NodeURL.fileURLToPath(srcDir);
  let isServe = false;
  let moduleScopeFiles: readonly string[] = [];
  return {
    name: "t3code:i18n-overlay",
    enforce: "pre",
    configResolved(config) {
      isServe = config.command === "serve";
      moduleScopeFiles = readModuleScopeFiles(isServe);
    },
    transform(code, id) {
      if (!isOverlaySourceFile(id, srcRoot)) return null;
      const file = (id.split("?")[0] ?? id).replaceAll("\\", "/");
      const result = transformSource(code, file, parseSync, { moduleScopeFiles });
      if (result?.code !== undefined) return { code: result.code, map: null };
      if (result && isServe) {
        console.warn(`[t3code] i18n overlay skipped, parse failed: ${file}`);
      }
      return null;
    },
  };
}
