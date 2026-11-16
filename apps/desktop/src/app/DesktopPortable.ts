import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { JoinPath } from "./DesktopStatePaths.ts";

const PortablePackageMetadata = Schema.fromJsonString(
  Schema.Struct({ t3codePortable: Schema.optional(Schema.Boolean) }),
);
const decodePortablePackageMetadata = Schema.decodeUnknownOption(PortablePackageMetadata);

/**
 * Synchronous: it runs before Clerk registers its scheme, where the startup chain must not yield.
 * The flag lives in the packaged package.json (scripts/build-desktop-artifact.ts) so a lost
 * marker file cannot silently fall back to the installed app's data.
 */
export function resolvePortableRoot(input: {
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly appPath: string;
  readonly execPath: string;
  readonly joinPath: JoinPath;
  readonly dirname: (path: string) => string;
  readonly readFile: (path: string) => string | undefined;
}): Option.Option<string> {
  if (!input.isPackaged || input.platform !== "win32") return Option.none();
  const raw = input.readFile(input.joinPath(input.appPath, "package.json"));
  if (raw === undefined) return Option.none();
  return decodePortablePackageMetadata(raw).pipe(
    Option.filter((metadata) => metadata.t3codePortable === true),
    Option.map(() => input.dirname(input.execPath)),
  );
}
