const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TRANSFORM_SOURCE_ID = "@t3tools/client-runtime/i18n-overlay/transform";
const MODULE_SCOPE_FILES_PATH = path.join(
  __dirname,
  "../../packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json",
);
const SRC_ROOT = path.join(__dirname, "src");

// Metro runs this file in worker processes, which inherit the variable set by metro.config.js.
const upstream = require(process.env.T3CODE_I18N_OVERLAY_UPSTREAM_TRANSFORMER);

function readModuleScopeFiles(parseModuleScopeList, dev) {
  try {
    const list = parseModuleScopeList(fs.readFileSync(MODULE_SCOPE_FILES_PATH, "utf8"));
    if (list !== null) return list.include;
  } catch {}
  if (dev)
    console.warn(`[t3code] i18n overlay module-scope list unreadable: ${MODULE_SCOPE_FILES_PATH}`);
  return [];
}

let overlay;
function loadOverlay(dev) {
  if (overlay === undefined) {
    const transformModule = require(TRANSFORM_SOURCE_ID);
    overlay = {
      ...transformModule,
      parseSync: require("vite-plus").parseSync,
      moduleScopeFiles: readModuleScopeFiles(transformModule.parseModuleScopeList, dev),
    };
  }
  return overlay;
}

function transform(args) {
  // Metro passes filenames relative to the project root.
  const filename = path.resolve(__dirname, args.filename);
  const { isOverlaySourceFile, transformSource, parseSync, moduleScopeFiles } = loadOverlay(
    args.options.dev,
  );
  if (!isOverlaySourceFile(filename, SRC_ROOT)) return upstream.transform(args);
  const rewritten = transformSource(args.src, filename, parseSync, { moduleScopeFiles });
  if (rewritten?.parseFailed && args.options.dev) {
    console.warn(`[t3code] i18n overlay skipped, parse failed: ${filename}`);
  }
  return upstream.transform(rewritten?.code ? { ...args, src: rewritten.code } : args);
}

function readModuleScopeFilesRaw() {
  try {
    return fs.readFileSync(MODULE_SCOPE_FILES_PATH);
  } catch {
    return "";
  }
}

function getCacheKey(...args) {
  return crypto
    .createHash("sha1")
    .update(upstream.getCacheKey?.(...args) ?? "")
    .update(fs.readFileSync(require.resolve(TRANSFORM_SOURCE_ID)))
    .update(fs.readFileSync(__filename))
    .update(readModuleScopeFilesRaw())
    .digest("hex");
}

module.exports = { ...upstream, transform, getCacheKey };
