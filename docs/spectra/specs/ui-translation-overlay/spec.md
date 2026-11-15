# ui-translation-overlay Specification

## Purpose

The UI translation overlay translates the client user interface (web, desktop, and mobile) into a selected locale without editing component source. At build time it rewrites English UI strings into dictionary lookups, and it keeps the translations in standalone per-locale dictionaries so the fork stays easy to sync with upstream.

## Requirements

### Requirement: Build-time rewrite of JSX text

The overlay transform SHALL rewrite every JSX text segment that contains at least one Latin letter into a lookup call keyed by that text with whitespace collapsed to single spaces and trimmed. The transform SHALL keep the whitespace that JSX would render around the text, and SHALL NOT add or remove line breaks in the transformed source.

#### Scenario: Plain JSX text becomes a lookup

- **WHEN** a client source file contains a JSX element whose only child is English text
- **THEN** the transformed source renders the lookup result for that text in place of the literal text

##### Example: text rewrites

| Source                                                                             | Transformed child                        | Lookup key                      |
| ---------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| `<span>Save changes</span>`                                                        | `{__t("Save changes")}`                  | `Save changes`                  |
| `<p>` + newline + `Ask before deleting` + newline + `a thread.` + newline + `</p>` | `{__t("Ask before deleting a thread.")}` | `Ask before deleting a thread.` |
| `<span>—</span>`                                                                   | unchanged                                | none (no Latin letter)          |

#### Scenario: Line numbers are preserved

- **WHEN** a source file is transformed
- **THEN** the transformed source has the same number of lines as the original, and every untouched statement stays on its original line

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Mixed text and expressions form one message

When a JSX element's children contain a contiguous run of English text and non-text children (expression containers or JSX elements), the transform SHALL emit one message for the whole run, using positional placeholders `{0}`, `{1}`, and so on in source order, and SHALL pass the run's non-text children as values to a placeholder-aware lookup. An expression container holding only a string literal (such as `{" "}` or `{"\n"}`) SHALL be treated as text whose value is kept verbatim, including line breaks, so that the rendered output is unchanged. Text inside nested JSX elements SHALL be translated as its own message.

#### Scenario: Count inside a sentence

- **WHEN** a JSX element contains the children `Delete {count} files`
- **THEN** the transform emits the message `Delete {0} files` with `count` as value 0

##### Example: message construction

| Source children                                    | Message                                             | Values             |
| -------------------------------------------------- | --------------------------------------------------- | ------------------ |
| `Delete {count} files`                             | `Delete {0} files`                                  | `count`            |
| `Press <Kbd>K</Kbd> to search`                     | `Press {0} to search`                               | the `Kbd` element  |
| `{name} joined`                                    | `{0} joined`                                        | `name`             |
| `Nothing yet.{"\n"}Tap <Text>+</Text> to add one.` | `Nothing yet.` + line break + `Tap {0} to add one.` | the `Text` element |

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Visible attributes are rewritten

The transform SHALL rewrite the values of the JSX attributes `title`, `placeholder`, `aria-label`, `aria-description`, `alt`, `label`, `description`, and `tooltip` when the value is a string literal, an expression container holding a string literal, or a template literal. A template literal SHALL become a placeholder message whose values are its embedded expressions. The transform SHALL NOT rewrite any other attribute.

#### Scenario: Attribute allowlist

- **WHEN** a JSX element has `title="Close panel"` and `className="text-sm"`
- **THEN** the `title` value becomes a lookup of `Close panel` and `className` stays unchanged

##### Example: attribute rewrites

| Attribute                                              | Rewritten | Message          |
| ------------------------------------------------------ | --------- | ---------------- |
| `placeholder="Search threads"`                         | yes       | `Search threads` |
| `aria-label` set to a template literal `Close ${name}` | yes       | `Close {0}`      |
| `data-testid="close-button"`                           | no        | none             |
| `className="flex"`                                     | no        | none             |

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Notification and confirmation call arguments are rewritten

The transform SHALL rewrite, when the value is a string literal or a template literal:

- the `title` and `description` properties of an object literal passed directly as an argument to `toastManager.add`;
- the first argument of `requestConfirmDialog`;
- the `title`, `message`, `confirmText`, and `cancelText` properties of an object literal passed directly as an argument to `Dialog.confirm` or `Dialog.prompt`;
- the first and second arguments of `Dialog.alert`.

The transform SHALL NOT rewrite properties of any other object literal, nor arguments of any other call.

#### Scenario: Toast title is translated at call time

- **WHEN** code calls `toastManager.add({ title: "Path copied", description: clipboardPath })`
- **THEN** `title` becomes a lookup of `Path copied` and `description` stays the expression `clipboardPath`

##### Example: dialog call rewrites

| Source                                                                                     | Rewritten              | Message                                   |
| ------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------- |
| `requestConfirmDialog(` template literal `Add the backend at ${origin}?` `)`               | first argument         | `Add the backend at {0}?`                 |
| `Dialog.confirm({ title: "Discard changes?", confirmText: "Discard", destructive: true })` | `title`, `confirmText` | `Discard changes?`, `Discard`             |
| `Dialog.alert("Could not open attachment", "Try again.")`                                  | both arguments         | `Could not open attachment`, `Try again.` |

#### Scenario: Data objects are not translated

- **WHEN** code calls `createThread({ title: "New thread" })`
- **THEN** the transformed source passes the literal `"New thread"` unchanged

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Menu item labels are rewritten

The transform SHALL rewrite the `label` property of an object literal that is evaluated inside a function body, when the property value is a string literal or a template literal. The transform SHALL NOT rewrite a `label` property of an object literal evaluated at module scope, of an object literal passed directly as an argument to a call whose callee name (identifier or member property) ends with `Command`, `Query`, `Action`, or `Result`, nor any other property name under this rule.

#### Scenario: Context menu item built at call time

- **WHEN** a function returns `[{ id: "pin", label: "Pin thread" }]`
- **THEN** `label` becomes a lookup of `Pin thread`

##### Example: label rewrites

| Source                                                                         | Rewritten | Message         |
| ------------------------------------------------------------------------------ | --------- | --------------- |
| `function items() { return [{ id: "pin", label: "Pin thread" }]; }`            | yes       | `Pin thread`    |
| inside a function, `label` set to a template literal `Filter by ${name}`       | yes       | `Filter by {0}` |
| module scope `const ACTIONS = [{ label: "Decline" }];`                         | no        | none            |
| inside a function, `{ id: "pin", value: "Pin thread" }`                        | no        | none            |
| inside a function, `useAtomCommand(command, { label: "answer link request" })` | no        | none            |
| inside a function, `useAction({ label: "Running source control action" })`     | no        | none            |

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Runnable item titles are rewritten

The transform SHALL rewrite the `title` and `description` properties of an object literal that is evaluated inside a function body and also has a property named `run`, when the property value is a string literal or a template literal. The same module-scope and `Command`/`Query`/`Action`/`Result` callee exclusions as for menu item labels SHALL apply. The transform SHALL NOT rewrite `title` or `description` of an object literal without a `run` property.

#### Scenario: Command palette action

- **WHEN** a function pushes `{ value: "action:triage", title: "Triage an issue", description: "An agent investigates a T3 Code problem", run: () => startTriage() }`
- **THEN** `title` becomes a lookup of `Triage an issue` and `description` becomes a lookup of `An agent investigates a T3 Code problem`

##### Example: runnable item rewrites

| Source                                                                    | Rewritten | Message              |
| ------------------------------------------------------------------------- | --------- | -------------------- |
| inside a function, `{ title: "Open pull requests", run: async () => {} }` | yes       | `Open pull requests` |
| inside a function, `{ title: "New thread" }` without `run`                | no        | none                 |
| inside a function, `createThread({ title: "New thread" })`                | no        | none                 |
| module scope `const ITEM = { title: "Change theme", run() {} };`          | no        | none                 |

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Exclusions

The transform SHALL leave the following unchanged: content inside a gt-react `T` element, content inside elements named `code`, `pre`, or `kbd` compared case-insensitively (so `Code`, `Pre`, and `Kbd` components are included), strings without a Latin letter, JSX text runs that contain a literal `{` or `}` or an HTML entity the transform cannot decode, test files (file names containing `.test.`), and files under `node_modules`. When a file has nothing to rewrite, the transform SHALL return no result so the build uses the original source, and SHALL NOT inject the runtime import.

#### Scenario: Upstream-translated content is left alone

- **WHEN** a component renders `<T>Language</T>`
- **THEN** the text inside `T` is not rewritten

#### Scenario: File without UI strings

- **WHEN** a source file contains no rewritable string
- **THEN** the transform returns no result and the file has no added import

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Runtime lookup with source fallback

The overlay runtime SHALL return the active locale's translation for a message key when the active locale's dictionary contains that key, and SHALL return the source English text otherwise. When the active locale is English, the runtime SHALL return the source text without consulting a dictionary.

#### Scenario: Missing translation falls back to English

- **WHEN** the active locale is `zh-TW` and the dictionary has no entry for `Codex`
- **THEN** the UI shows `Codex`

##### Example: lookups

| Active locale | Key            | Dictionary entry | Result         |
| ------------- | -------------- | ---------------- | -------------- |
| `zh-TW`       | `Save changes` | `儲存變更`       | `儲存變更`     |
| `zh-TW`       | `Codex`        | none             | `Codex`        |
| `en`          | `Save changes` | any              | `Save changes` |

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Placeholder substitution

The placeholder-aware lookup SHALL replace each `{n}` in the translated message with value `n`, SHALL allow a translation to reorder placeholders or omit any of them, and SHALL leave the message unchanged when it contains no placeholders. When a value is a React element, the result SHALL render that element in the placeholder's position.

#### Scenario: Reordered and omitted placeholders

- **WHEN** the dictionary maps `Delete {0} file{1}` to `刪除 {0} 個檔案`
- **THEN** rendering with values `3` and `"s"` shows `刪除 3 個檔案`

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Locale activation in clients

On the web and desktop clients, the first render after startup SHALL already use the resolved locale's overlay dictionary. On every client, changing the language setting SHALL remount the translated UI so that every rewritten string shows the newly selected locale, including strings that were memoized before the change.

#### Scenario: Startup in Traditional Chinese

- **WHEN** the saved language is `zh-TW` and the web app starts
- **THEN** the first rendered screen shows translated sidebar and composer strings without an English frame first

#### Scenario: Switching back to English

- **WHEN** the user changes the language from `zh-TW` to English in Settings
- **THEN** every rewritten string shows its English source text

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Dictionary maintenance command

The repository SHALL provide a command that scans `apps/web/src` and `apps/mobile/src` with the same transform rules and reports, as JSON, (a) message keys absent from a given locale's dictionary, each with the source files that contain it, and (b) dictionary keys that no longer occur in the source. The command SHALL exit with status 0 when it produces a report, SHALL exit with a non-zero status on invalid arguments, and SHALL NOT write to the dictionary.

#### Scenario: Reporting missing keys after an upstream sync

- **WHEN** upstream adds `<span>Export logs</span>` and the maintainer runs the missing-keys command for `zh-TW`
- **THEN** the output lists `Export logs` with the source file that contains it

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->

---

### Requirement: Complete zh-TW dictionary

The `zh-TW` overlay dictionary SHALL contain an entry for every message key the maintenance command finds in the client sources at the time this change ships. Strings intentionally kept in English (product, provider, and command names) SHALL be entries that map to themselves, so that the missing-keys report for `zh-TW` is empty.

#### Scenario: No missing keys at ship time

- **WHEN** the missing-keys command runs for `zh-TW` on the shipped commit
- **THEN** it reports zero missing keys

<!-- @trace
source: add-zh-tw-i18n-overlay
updated: 2026-11-15
code:
  - pnpm-workspace.yaml
  - .agents/skills/spectra-commit/SKILL.md
  - docs/adr/0001-compile-time-translation-overlay.md
  - docs/adr/README.md
  - apps/mobile/src/App.tsx
  - packages/client-runtime/package.json
  - apps/mobile/src/i18n/OverlayLocaleRoot.tsx
  - scripts/i18n-overlay.ts
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-archive/SKILL.md
  - apps/mobile/app.config.ts
  - .agents/skills/spectra-propose/SKILL.md
  - .agents/skills/spectra-verify/SKILL.md
  - apps/mobile/src/i18n/I18nProvider.tsx
  - knip.jsonc
  - apps/web/src/i18n/I18nProvider.tsx
  - apps/mobile/src/i18n/overlayNavigationState.ts
  - .agents/skills/spectra-drift/SKILL.md
  - apps/web/vite.config.ts
  - packages/client-runtime/src/i18nOverlay/dictionaries/zh-TW.json
  - packages/client-runtime/src/i18nOverlay/runtime.ts
  - packages/client-runtime/src/i18nOverlay/transform.ts
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-debug/SKILL.md
  - .agents/skills/spectra-apply/SKILL.md
  - apps/web/vite/i18nOverlay.ts
  - .agents/skills/spectra-review/SKILL.md
  - apps/web/src/i18n/runtime.ts
  - apps/mobile/i18nOverlayTransformer.js
  - apps/mobile/metro.config.js
  - vite.config.ts
  - AGENTS.md
  - .agents/skills/spectra-ingest/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
tests:
  - scripts/i18n-overlay.test.ts
  - packages/client-runtime/src/i18nOverlay/runtime.test.ts
  - packages/client-runtime/src/i18nOverlay/transform.test.ts
  - apps/mobile/src/features/observability/tracing.test.ts
  - apps/mobile/src/i18n/overlayNavigationState.test.ts
  - apps/web/src/i18n/runtime.test.ts
-->
