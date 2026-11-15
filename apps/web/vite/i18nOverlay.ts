import * as NodeURL from "node:url";

import {
  isOverlaySourceFile,
  transformSource,
} from "@t3tools/client-runtime/i18n-overlay/transform";
import { parseSync, type Plugin } from "vite-plus";

export function i18nOverlayPlugin(srcDir: URL): Plugin {
  const srcRoot = NodeURL.fileURLToPath(srcDir);
  let isServe = false;
  return {
    name: "t3code:i18n-overlay",
    enforce: "pre",
    configResolved(config) {
      isServe = config.command === "serve";
    },
    transform(code, id) {
      if (!isOverlaySourceFile(id, srcRoot)) return null;
      const file = (id.split("?")[0] ?? id).replaceAll("\\", "/");
      const result = transformSource(code, file, parseSync);
      if (result?.code !== undefined) return { code: result.code, map: null };
      if (result && isServe) {
        console.warn(`[t3code] i18n overlay skipped, parse failed: ${file}`);
      }
      return null;
    },
  };
}
