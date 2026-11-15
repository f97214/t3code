#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Synchronous read-only repo scan.
// Fork-only dictionary maintenance for the zh-TW overlay. Read-only; prints JSON.
// Usage: node scripts/i18n-overlay.ts missing --locale <id> [--under <dir>]
//        node scripts/i18n-overlay.ts stale --locale <id>
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { parseSync } from "vite-plus";

// Loaded by URL at runtime so the file stays out of the scripts TypeScript program.
type CollectMessages = (
  code: string,
  filename: string,
  parse: typeof parseSync,
) => Array<{ key: string; line: number }>;
const { collectMessages } = (await import(
  NodeURL.pathToFileURL(
    NodePath.join(import.meta.dirname, "../packages/client-runtime/src/i18nOverlay/transform.ts"),
  ).href
)) as { collectMessages: CollectMessages };

const SOURCE_ROOTS = ["apps/web/src", "apps/mobile/src"];
const DICTIONARY_DIR = "packages/client-runtime/src/i18nOverlay/dictionaries";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const toPosix = (value: string) => value.split(NodePath.sep).join("/");

function* walk(directory: string): Generator<string> {
  if (!NodeFS.existsSync(directory)) return;
  const entries = NodeFS.readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE_EXTENSIONS.has(NodePath.extname(entry.name))) yield full;
  }
}

/** Message key -> "repo/relative/file:line" occurrences. `under` is scanned literally. */
export function scanMessages(repoRoot: string, under?: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  const roots = under === undefined ? SOURCE_ROOTS : [under];
  for (const root of roots) {
    for (const file of walk(NodePath.resolve(repoRoot, root))) {
      const relative = toPosix(NodePath.relative(repoRoot, file));
      const code = NodeFS.readFileSync(file, "utf8");
      for (const { key, line } of collectMessages(code, relative, parseSync)) {
        const occurrences = found.get(key) ?? [];
        occurrences.push(`${relative}:${line}`);
        found.set(key, occurrences);
      }
    }
  }
  return found;
}

export function readDictionary(repoRoot: string, locale: string): Record<string, string> {
  const file = NodePath.join(repoRoot, DICTIONARY_DIR, `${locale}.json`);
  if (!NodeFS.existsSync(file)) return {};
  return JSON.parse(NodeFS.readFileSync(file, "utf8")) as Record<string, string>;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function findMissing(repoRoot: string, locale: string, under?: string) {
  const dictionary = readDictionary(repoRoot, locale);
  const missing = [...scanMessages(repoRoot, under)]
    .filter(([key]) => !Object.hasOwn(dictionary, key))
    .toSorted(([a], [b]) => compare(a, b))
    .map(([key, files]) => ({ key, files: [...new Set(files)] }));
  return { locale, missing };
}

export function findStale(repoRoot: string, locale: string) {
  const present = scanMessages(repoRoot);
  const stale = Object.keys(readDictionary(repoRoot, locale))
    .filter((key) => !present.has(key))
    .toSorted(compare);
  return { locale, stale };
}

const USAGE =
  "Usage: node scripts/i18n-overlay.ts missing --locale <id> [--under <dir>]\n" +
  "       node scripts/i18n-overlay.ts stale --locale <id>\n";

export function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  let locale: string | undefined;
  let under: string | undefined;
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === "--locale" && value !== undefined) locale = value;
    else if (flag === "--under" && value !== undefined && command === "missing") under = value;
    else {
      process.stderr.write(USAGE);
      return 2;
    }
    index += 1;
  }
  if ((command !== "missing" && command !== "stale") || locale === undefined) {
    process.stderr.write(USAGE);
    return 2;
  }
  const repoRoot = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
  const result =
    command === "missing" ? findMissing(repoRoot, locale, under) : findStale(repoRoot, locale);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
