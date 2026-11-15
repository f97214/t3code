## ADDED Requirements

### Requirement: Conditional string branches in display positions

Wherever another overlay rule rewrites a string literal or template literal, the transform SHALL also accept a conditional expression or a logical expression (`&&`, `||`, `??`) in that position, and SHALL rewrite each of its branches that is a string literal or template literal containing a Latin letter. The branches of a conditional expression are its consequent and alternate; the branch of a logical expression is its right operand. The transform SHALL descend through parentheses and through nested conditional and logical branches. It SHALL NOT rewrite the test of a conditional expression nor the left operand of a logical expression. A JSX child expression container whose expression is a conditional or logical expression SHALL be treated as such a position; when that container is part of a mixed text run, it SHALL remain a placeholder value of the run's message and its branches SHALL be rewritten inside that value.

#### Scenario: Attribute with a ternary

- **WHEN** a JSX element has `title={busy ? "Saving…" : "Save"}`
- **THEN** the transformed attribute is `title={busy ? __t("Saving…") : __t("Save")}`

##### Example: branch rewrites

| Source                                                                       | Rewritten branches             | Messages                         |
| ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------- |
| JSX child `{open ? "Hide details" : "Show details"}`                         | both                           | `Hide details`, `Show details`   |
| JSX child `{error && "Could not connect"}`                                   | right operand                  | `Could not connect`              |
| `placeholder={hint ?? "Search threads"}`                                     | right operand                  | `Search threads`                 |
| `aria-label` set to `a ? "Pin" : (b ? "Unpin" : "Pinned")`                   | all three strings              | `Pin`, `Unpin`, `Pinned`         |
| JSX children `Status: {ok ? "Ready" : "Failed"}`                             | both, inside placeholder `{0}` | `Status: {0}`, `Ready`, `Failed` |
| `className={active ? "font-bold" : "font-normal"}`                           | none                           | none                             |
| `data-state={open ? "Open" : "Closed"}`                                      | none                           | none                             |
| inside a function, `createThread({ title: draft ? "Draft" : "New thread" })` | none                           | none                             |

#### Scenario: Conditions are left alone

- **WHEN** a JSX child is `{mode === "Plan" ? "Planning" : "Building"}`
- **THEN** the string `"Plan"` in the test stays unchanged and only `Planning` and `Building` become lookups

### Requirement: Module-scope file list

The repository SHALL keep a module-scope file list at `packages/client-runtime/src/i18nOverlay/moduleScopeFiles.json` with the shape `{ "include": string[], "exclude": { [path: string]: string } }`, where each path is relative to the repository root and each `exclude` value states why the file was rejected. The transform SHALL accept an option `moduleScopeFiles` (a list of repository-relative paths) and SHALL apply the module-scope rules only to a file whose `/`-separated filename equals a listed path or ends with `/` followed by a listed path. The web and mobile build integrations and the dictionary maintenance command SHALL pass the `include` list. When the list file cannot be read or does not have this shape, the build integrations SHALL treat the list as empty and SHALL keep applying every other rule.

#### Scenario: Unlisted file keeps module-scope strings in English

- **WHEN** `apps/web/src/components/settings/customModelEditor.logic.ts` is in `exclude` and contains the module-scope object `{ id: "low", label: "Low" }`
- **THEN** the transformed file keeps `label: "Low"` unchanged

##### Example: path matching

| `include` entry                       | Filename passed to the transform                 | Module-scope rules apply |
| ------------------------------------- | ------------------------------------------------ | ------------------------ |
| `apps/web/src/composerPlaceholder.ts` | `D:/repo/apps/web/src/composerPlaceholder.ts`    | yes                      |
| `apps/web/src/composerPlaceholder.ts` | `apps/web/src/composerPlaceholder.ts`            | yes                      |
| `apps/web/src/composerPlaceholder.ts` | `D:\repo\apps\web\src\composerPlaceholder.ts`    | yes                      |
| `apps/web/src/composerPlaceholder.ts` | `D:/repo/apps/web/src/oldcomposerPlaceholder.ts` | no                       |
| none                                  | any                                              | no                       |

### Requirement: Module-scope display properties become getters

In a file selected by the module-scope file list, the transform SHALL rewrite a property of an object literal evaluated at module scope into a getter that performs the lookup on every read, when the property name is `label`, `title`, `description`, `placeholder`, `hint`, `detail`, `detailLabel`, or `accessibilityLabel`, the key is an identifier or a string literal, and the value is a string literal or template literal containing a Latin letter, or a conditional or logical expression with such branches. The transform SHALL NOT rewrite computed keys, shorthand properties, methods, spread elements, or any other property name under this rule, and SHALL NOT rewrite an object literal passed directly to a call whose callee name ends with `Command`, `Query`, `Action`, or `Result`.

#### Scenario: Settings row title follows the active locale

- **WHEN** `apps/web/src/components/settings/settingsSearch.ts` is listed and its module-scope array holds `{ id: "theme", title: "Theme", to: "/settings/appearance" }`
- **THEN** the transformed property is `get title() { return __t("Theme"); }`, and a settings row rendered after the locale switches to `zh-TW` shows the `zh-TW` translation of `Theme`

##### Example: getter rewrites in a listed file

| Module-scope source                               | Transformed property                                        | Message               |
| ------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| `{ decision: "accept", label: "Approve" }`        | `get label() { return __t("Approve"); }`                    | `Approve`             |
| `{ "aria-label": "Close" }`                       | unchanged                                                   | none                  |
| `{ title: "Theme", to: "/settings/appearance" }`  | `title` becomes a getter; `to` unchanged                    | `Theme`               |
| `{ description: isMac ? "Uses ⌘" : "Uses Ctrl" }` | getter returning `isMac ? __t("Uses ⌘") : __t("Uses Ctrl")` | `Uses ⌘`, `Uses Ctrl` |
| `{ label }` (shorthand)                           | unchanged                                                   | none                  |
| `{ [key]: "Theme" }` (computed)                   | unchanged                                                   | none                  |
| `{ name: "Dev server" }`                          | unchanged                                                   | none                  |

#### Scenario: Line count is preserved

- **WHEN** a listed file has a module-scope property whose template literal value spans two lines
- **THEN** the transformed file has the same number of lines as the original

##### Example: two-line template literal

- **GIVEN** a listed file with `export const HELP = {` on line 3, a `hint` property whose template literal value `Press Enter` + newline + `to send` starts on line 4 and ends on line 5, and `};` on line 6
- **WHEN** the file is transformed
- **THEN** `hint` becomes a getter whose lookup key is `Press Enter` + newline + `to send`, the getter spans lines 4–5, and `};` stays on line 6

### Requirement: Module-scope string constants are rebound on locale change

In a file selected by the module-scope file list, the transform SHALL rewrite a module-scope `const` declaration (including `export const`) that has exactly one declarator, an identifier binding, and an initializer that is a string literal or template literal containing a Latin letter, or a conditional or logical expression with such branches, into a `let` declaration without an initializer followed by a call to the overlay runtime's rebinding function whose callback assigns the rewritten initializer to the binding. The transform SHALL NOT rewrite declarations with several declarators, destructuring patterns, or initializers of any other kind.

#### Scenario: Composer placeholder constant

- **WHEN** `apps/web/src/composerPlaceholder.ts` is listed and contains `export const DEFAULT_COMPOSER_PLACEHOLDER = "Ask anything. @ files, $ skills, / commands";`
- **THEN** the transformed source is `export let DEFAULT_COMPOSER_PLACEHOLDER; __tb(() => { DEFAULT_COMPOSER_PLACEHOLDER = __t("Ask anything. @ files, $ skills, / commands"); });` on the same line

##### Example: constant rewrites in a listed file

| Module-scope source                                 | Rewritten          | Message                    |
| --------------------------------------------------- | ------------------ | -------------------------- |
| `const NOTE = "Uses custom intervals.";`            | yes                | `Uses custom intervals.`   |
| `const HINT = isMac ? "Press ⌘K" : "Press Ctrl K";` | yes, both branches | `Press ⌘K`, `Press Ctrl K` |
| `const A = "One", B = "Two";`                       | no                 | none                       |
| `const LIMIT = 50;`                                 | no                 | none                       |
| `let TITLE = "Draft";`                              | no                 | none                       |
| inside a function, `const label = "Save";`          | no                 | none                       |

### Requirement: Rebinding runtime

The overlay runtime SHALL export a function `__tb(assign)` that calls `assign` once immediately and registers it. Whenever `setOverlayLocale` or `registerOverlayDictionary` changes which dictionary is active (including changing to no dictionary for English), the runtime SHALL call every registered `assign` in registration order before returning. When a call leaves the active dictionary unchanged, the runtime SHALL NOT call them.

#### Scenario: Switching locale rebinds constants

- **WHEN** a module registered `__tb(() => { X = __t("Save changes"); })`, the `zh-TW` dictionary maps `Save changes` to `儲存變更`, and `setOverlayLocale("zh-TW")` is called
- **THEN** `X` is `儲存變更`, and after `setOverlayLocale("en")` it is `Save changes`

##### Example: when callbacks run

| Step                                                         | Active dictionary before | Active dictionary after | Callbacks run     |
| ------------------------------------------------------------ | ------------------------ | ----------------------- | ----------------- |
| `__tb(assign)`                                               | none                     | none                    | once, immediately |
| `setOverlayLocale("zh-TW")` with the dictionary registered   | none                     | zh-TW                   | yes               |
| `setOverlayLocale("zh-TW")` again                            | zh-TW                    | zh-TW                   | no                |
| `registerOverlayDictionary("ja", …)` while `zh-TW` is active | zh-TW                    | zh-TW                   | no                |
| `setOverlayLocale("en")`                                     | zh-TW                    | none                    | yes               |

### Requirement: Module-scope candidate report

The dictionary maintenance command SHALL provide a `module-candidates` subcommand that scans `apps/web/src` and `apps/mobile/src` and reports, as JSON on stdout, (a) every file in which the module-scope rules would collect at least one message but which is listed in neither `include` nor `exclude`, with its count of such messages and up to five sample keys, and (b) every `include` or `exclude` path that does not exist. The subcommand SHALL exit with status 0, SHALL NOT write any file, and SHALL skip files that fail to parse. The `missing` and `stale` subcommands SHALL apply the module-scope rules to files in `include`.

#### Scenario: Upstream adds a new constants file

- **WHEN** upstream adds `apps/web/src/exportOptions.ts` containing the module-scope array `[{ id: "csv", label: "Export as CSV" }]` and the maintainer runs `node scripts/i18n-overlay.ts module-candidates`
- **THEN** the output lists `apps/web/src/exportOptions.ts` under `unlisted` with count 1 and sample `Export as CSV`

#### Scenario: Listed file was removed upstream

- **WHEN** `include` lists `apps/web/src/composerPlaceholder.ts` and that file no longer exists
- **THEN** the output lists `apps/web/src/composerPlaceholder.ts` under `missingListed`

## MODIFIED Requirements

### Requirement: Menu item labels are rewritten

The transform SHALL rewrite the `label` property of an object literal that is evaluated inside a function body, when the property value is a string literal or a template literal. The transform SHALL NOT rewrite a `label` property of an object literal evaluated at module scope, except as provided by the module-scope display property rule for files selected by the module-scope file list, of an object literal passed directly as an argument to a call whose callee name (identifier or member property) ends with `Command`, `Query`, `Action`, or `Result`, nor any other property name under this rule.

#### Scenario: Context menu item built at call time

- **WHEN** a function returns `[{ id: "pin", label: "Pin thread" }]`
- **THEN** `label` becomes a lookup of `Pin thread`

##### Example: label rewrites

| Source                                                                         | Rewritten | Message         |
| ------------------------------------------------------------------------------ | --------- | --------------- |
| `function items() { return [{ id: "pin", label: "Pin thread" }]; }`            | yes       | `Pin thread`    |
| inside a function, `label` set to a template literal `Filter by ${name}`       | yes       | `Filter by {0}` |
| module scope `const ACTIONS = [{ label: "Decline" }];` in an unlisted file     | no        | none            |
| inside a function, `{ id: "pin", value: "Pin thread" }`                        | no        | none            |
| inside a function, `useAtomCommand(command, { label: "answer link request" })` | no        | none            |
| inside a function, `useAction({ label: "Running source control action" })`     | no        | none            |

### Requirement: Runnable item titles are rewritten

The transform SHALL rewrite the `title` and `description` properties of an object literal that is evaluated inside a function body and also has a property named `run`, when the property value is a string literal or a template literal. The same module-scope and `Command`/`Query`/`Action`/`Result` callee exclusions as for menu item labels SHALL apply, including the exception for files selected by the module-scope file list. The transform SHALL NOT rewrite `title` or `description` of an object literal evaluated inside a function body without a `run` property.

#### Scenario: Command palette action

- **WHEN** a function pushes `{ value: "action:triage", title: "Triage an issue", description: "An agent investigates a T3 Code problem", run: () => startTriage() }`
- **THEN** `title` becomes a lookup of `Triage an issue` and `description` becomes a lookup of `An agent investigates a T3 Code problem`

##### Example: runnable item rewrites

| Source                                                                               | Rewritten | Message              |
| ------------------------------------------------------------------------------------ | --------- | -------------------- |
| inside a function, `{ title: "Open pull requests", run: async () => {} }`            | yes       | `Open pull requests` |
| inside a function, `{ title: "New thread" }` without `run`                           | no        | none                 |
| inside a function, `createThread({ title: "New thread" })`                           | no        | none                 |
| module scope `const ITEM = { title: "Change theme", run() {} };` in an unlisted file | no        | none                 |
