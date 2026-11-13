#!/usr/bin/env node
// Fork-only guard: blocks writes to the upstream repo on this machine.
// Usage: node scripts/fork-guard.mjs [--check]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FORK = "f97214/t3code";
const UPSTREAM_OWNER = "pingdotgg";
const BLOCKED_BASE = `DISABLED-${UPSTREAM_OWNER}/`;
const UPSTREAM_PREFIXES = [
  `https://github.com/${UPSTREAM_OWNER}/`,
  `git@github.com:${UPSTREAM_OWNER}/`,
  `ssh://git@github.com/${UPSTREAM_OWNER}/`,
];
const DENY_PATTERNS = [
  `gh * --repo ${UPSTREAM_OWNER}/*`,
  `gh * --repo=${UPSTREAM_OWNER}/*`,
  `gh * -R ${UPSTREAM_OWNER}/*`,
  `gh api *${UPSTREAM_OWNER}*`,
  `git push *${UPSTREAM_OWNER}*`,
];
const DENY_RULES = DENY_PATTERNS.flatMap((p) => [`Bash(${p})`, `PowerShell(${p})`]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = join(root, ".claude", "settings.local.json");
const checkOnly = process.argv.includes("--check");

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const hasGh = run("gh", ["--version"]) !== null;

function pushRewrites() {
  return (run("git", ["config", "--local", "--get-all", `url.${BLOCKED_BASE}.pushInsteadOf`]) ?? "")
    .split("\n")
    .filter(Boolean);
}

function readSettings() {
  if (!existsSync(settingsPath)) return {};
  return JSON.parse(readFileSync(settingsPath, "utf8"));
}

const missing = [];

const rewrites = pushRewrites();
const missingPrefixes = UPSTREAM_PREFIXES.filter((p) => !rewrites.includes(p));
if (missingPrefixes.length) missing.push(`git pushInsteadOf: ${missingPrefixes.join(", ")}`);

const ghDefault = hasGh ? run("gh", ["repo", "set-default", "--view"]) : null;
if (hasGh && ghDefault !== FORK) missing.push(`gh default repo (now: ${ghDefault || "unset"})`);

const settings = readSettings();
const deny = settings.permissions?.deny ?? [];
const missingDeny = DENY_RULES.filter((r) => !deny.includes(r));
if (missingDeny.length) missing.push(`${missingDeny.length} deny rule(s) in .claude/settings.local.json`);

if (checkOnly) {
  if (missing.length) {
    console.error(`fork-guard: missing\n  - ${missing.join("\n  - ")}\nRun: node scripts/fork-guard.mjs`);
    process.exit(1);
  }
  console.log("fork-guard: ok");
  process.exit(0);
}

for (const prefix of missingPrefixes) {
  execFileSync("git", ["config", "--local", "--add", `url.${BLOCKED_BASE}.pushInsteadOf`, prefix], { cwd: root });
}

if (hasGh && ghDefault !== FORK) {
  execFileSync("gh", ["repo", "set-default", FORK], { cwd: root, stdio: "inherit" });
} else if (!hasGh) {
  console.warn("fork-guard: gh not found, skipped gh default repo");
}

if (missingDeny.length) {
  settings.permissions = { ...settings.permissions, deny: [...deny, ...missingDeny] };
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

console.log(missing.length ? `fork-guard: applied\n  - ${missing.join("\n  - ")}` : "fork-guard: already ok");
