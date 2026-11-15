const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TRANSFORM_SOURCE_ID = "@t3tools/client-runtime/i18n-overlay/transform";
const SRC_ROOT = path.join(__dirname, "src");

// Metro runs this file in worker processes, which inherit the variable set by metro.config.js.
const upstream = require(process.env.T3CODE_I18N_OVERLAY_UPSTREAM_TRANSFORMER);

let overlay;
function loadOverlay() {
  overlay ??= {
    ...require(TRANSFORM_SOURCE_ID),
    parseSync: require("vite-plus").parseSync,
  };
  return overlay;
}

function transform(args) {
  // Metro passes filenames relative to the project root.
  const filename = path.resolve(__dirname, args.filename);
  const { isOverlaySourceFile, transformSource, parseSync } = loadOverlay();
  if (!isOverlaySourceFile(filename, SRC_ROOT)) return upstream.transform(args);
  const rewritten = transformSource(args.src, filename, parseSync);
  if (rewritten?.parseFailed && args.options.dev) {
    console.warn(`[t3code] i18n overlay skipped, parse failed: ${filename}`);
  }
  return upstream.transform(rewritten?.code ? { ...args, src: rewritten.code } : args);
}

function getCacheKey(...args) {
  return crypto
    .createHash("sha1")
    .update(upstream.getCacheKey?.(...args) ?? "")
    .update(fs.readFileSync(require.resolve(TRANSFORM_SOURCE_ID)))
    .update(fs.readFileSync(__filename))
    .digest("hex");
}

module.exports = { ...upstream, transform, getCacheKey };
