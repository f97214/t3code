#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off - Synchronous read-only repo scan.
// Fork-only dictionary maintenance for the zh-TW overlay. Read-only; prints JSON.
// Usage: node scripts/i18n-overlay.ts missing --locale <id> [--under <dir>]
//        node scripts/i18n-overlay.ts stale --locale <id>
//        node scripts/i18n-overlay.ts module-candidates
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { parseSync } from "vite-plus";

// Loaded by URL at runtime so the file stays out of the scripts TypeScript program.
type CollectMessages = (
  code: string,
  filename: string,
  parse: typeof parseSync,
  options?: { moduleScopeFiles?: readonly string[] },
) => Array<{ key: string; line: number }>;
interface ModuleScopeList {
  include: string[];
  exclude: Record<string, string>;
}
const { collectMessages, parseModuleScopeList } = (await import(
  NodeURL.pathToFileURL(
    NodePath.join(import.meta.dirname, "../packages/client-runtime/src/i18nOverlay/transform.ts"),
  ).href
)) as {
  collectMessages: CollectMessages;
  parseModuleScopeList: (text: string) => ModuleScopeList | null;
};

const SOURCE_ROOTS = ["apps/web/src", "apps/mobile/src"];
const DICTIONARY_DIR = "packages/client-runtime/src/i18nOverlay/dictionaries";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

const MODULE_SCOPE_LIST = "packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json";

// @effect-diagnostics-next-line extendsNativeError:off -- Standalone Node script, no Effect runtime.
class ModuleScopeListError extends Error {}

// A missing file is an empty list; a malformed one is an error the caller reports.
function readModuleScopeList(repoRoot: string): ModuleScopeList {
  const file = NodePath.join(repoRoot, MODULE_SCOPE_LIST);
  if (!NodeFS.existsSync(file)) return { include: [], exclude: {} };
  const list = parseModuleScopeList(NodeFS.readFileSync(file, "utf8"));
  if (list === null) throw new ModuleScopeListError(`invalid module-scope list: ${file}`);
  return list;
}

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
  const moduleScopeFiles = readModuleScopeList(repoRoot).include;
  for (const root of roots) {
    for (const file of walk(NodePath.resolve(repoRoot, root))) {
      const relative = toPosix(NodePath.relative(repoRoot, file));
      const code = NodeFS.readFileSync(file, "utf8");
      for (const { key, line } of collectMessages(code, relative, parseSync, {
        moduleScopeFiles,
      })) {
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

export function findModuleCandidates(repoRoot: string) {
  const list = readModuleScopeList(repoRoot);
  const listed = new Set([...list.include, ...Object.keys(list.exclude)]);
  const unlisted: Array<{ file: string; count: number; samples: string[] }> = [];
  for (const root of SOURCE_ROOTS) {
    for (const full of walk(NodePath.resolve(repoRoot, root))) {
      const file = toPosix(NodePath.relative(repoRoot, full));
      if (listed.has(file)) continue;
      const code = NodeFS.readFileSync(full, "utf8");
      const remaining = new Map<string, number>();
      for (const { key } of collectMessages(code, file, parseSync, { moduleScopeFiles: [] })) {
        remaining.set(key, (remaining.get(key) ?? 0) + 1);
      }
      const extra: string[] = [];
      for (const { key } of collectMessages(code, file, parseSync, { moduleScopeFiles: [file] })) {
        const left = remaining.get(key) ?? 0;
        if (left > 0) remaining.set(key, left - 1);
        else extra.push(key);
      }
      if (extra.length > 0) {
        unlisted.push({ file, count: extra.length, samples: [...new Set(extra)].slice(0, 5) });
      }
    }
  }
  const missingListed = [...listed]
    .filter((path) => !NodeFS.existsSync(NodePath.join(repoRoot, path)))
    .toSorted(compare);
  return { unlisted: unlisted.toSorted((a, b) => compare(a.file, b.file)), missingListed };
}

const USAGE =
  "Usage: node scripts/i18n-overlay.ts missing --locale <id> [--under <dir>]\n" +
  "       node scripts/i18n-overlay.ts stale --locale <id>\n" +
  "       node scripts/i18n-overlay.ts module-candidates\n";

export function main(
  argv: readonly string[],
  repoRoot = NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), ".."),
): number {
  try {
    return run(argv, repoRoot);
  } catch (error) {
    if (!(error instanceof ModuleScopeListError)) throw error;
    process.stderr.write(`${error.message}\n`);
    return 2;
  }
}

function run(argv: readonly string[], repoRoot: string): number {
  const [command, ...rest] = argv;
  if (command === "module-candidates") {
    if (rest.length > 0) {
      process.stderr.write(USAGE);
      return 2;
    }
    process.stdout.write(`${JSON.stringify(findModuleCandidates(repoRoot), null, 2)}\n`);
    return 0;
  }
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
  const result =
    command === "missing" ? findMissing(repoRoot, locale, under) : findStale(repoRoot, locale);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
