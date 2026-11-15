import { parseSync } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";

import {
  collectMessages,
  isOverlaySourceFile,
  parseModuleScopeList,
  transformSource,
} from "./transform.ts";

const IMPORT_T = 'import { __t, __ts, __tx } from "@t3tools/client-runtime/i18n-overlay";';
const IMPORT_FRAGMENT = 'import { Fragment as __I18nFragment } from "react";';

const run = (code: string, filename = "Sample.tsx") => transformSource(code, filename, parseSync);
const runListed = (code: string, filename = "a.ts") =>
  transformSource(code, filename, parseSync, { moduleScopeFiles: [filename] });
const keys = (code: string, filename = "Sample.tsx") =>
  collectMessages(code, filename, parseSync).map((message) => message.key);

describe("Build-time rewrite of JSX text", () => {
  it("rewrites a plain text child into a lookup call", () => {
    const source = "export const A = () => <span>Save changes</span>;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}export const A = () => <span>{__t("Save changes")}</span>;`,
    );
    expect(keys(source)).toEqual(["Save changes"]);
  });

  it("collapses multi-line text into one key and keeps the line count", () => {
    const source = [
      "export const A = () => (",
      "  <p>",
      "    Ask before deleting",
      "    a thread.",
      "  </p>",
      ");",
      "export const B = 1;",
    ].join("\n");
    const result = run(source);
    expect(result?.code).toBe(
      [
        `${IMPORT_T}export const A = () => (`,
        "  <p>",
        '    {__t("Ask before deleting a thread.")',
        "}",
        "  </p>",
        ");",
        "export const B = 1;",
      ].join("\n"),
    );
    expect(keys(source)).toEqual(["Ask before deleting a thread."]);
  });

  it("leaves text without a Latin letter unchanged", () => {
    expect(run("export const A = () => <span>—</span>;")).toBeNull();
    expect(keys("export const A = () => <span>—</span>;")).toEqual([]);
  });

  it("keeps the same-line whitespace JSX renders around the text", () => {
    expect(run("export const A = () => <span> Save </span>;")?.code).toBe(
      `${IMPORT_T}export const A = () => <span> {__t("Save")} </span>;`,
    );
  });

  it("does not turn an element-only child list into a message", () => {
    const source = ["export const A = () => (", "  <div>", "    <b>Hi</b>", "  </div>", ");"].join(
      "\n",
    );
    expect(run(source)?.code).toBe(
      [
        `${IMPORT_T}export const A = () => (`,
        "  <div>",
        '    <b>{__t("Hi")}</b>',
        "  </div>",
        ");",
      ].join("\n"),
    );
  });

  it("keeps the line count when a rewritten file has later statements", () => {
    const source = [
      "const a = <i>Hello</i>;",
      "",
      "const b = <p>",
      "  One",
      "  two",
      "</p>;",
      "const c = 1;",
    ].join("\n");
    const out = run(source)?.code ?? "";
    expect(out.split("\n").length).toBe(source.split("\n").length);
    expect(out.split("\n").at(-1)).toBe("const c = 1;");
  });

  it("decodes HTML entities in the message and skips unknown ones", () => {
    expect(run("const a = <i>Fish &amp; chips</i>;")?.code).toBe(
      `${IMPORT_T}const a = <i>{__t("Fish & chips")}</i>;`,
    );
    expect(run("const a = <i>Fish &unknownentity; chips</i>;")).toBeNull();
  });
});

describe("Mixed text and expressions form one message", () => {
  const frag = (index: number, inner: string) =>
    `<__I18nFragment key="i18n-${index}">${inner}</__I18nFragment>`;

  it("uses a placeholder for an expression between text", () => {
    const source = "const a = <p>Delete {count} files</p>;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}${IMPORT_FRAGMENT}const a = <p>{__tx("Delete {0} files", [${frag(0, "{count}")}])}</p>;`,
    );
    expect(keys(source)).toEqual(["Delete {0} files"]);
  });

  it("uses a placeholder for a JSX element and leaves its excluded content alone", () => {
    const source = "const a = <p>Press <Kbd>K</Kbd> to search</p>;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}${IMPORT_FRAGMENT}const a = <p>{__tx("Press {0} to search", [${frag(0, "<Kbd>K</Kbd>")}])}</p>;`,
    );
    expect(keys(source)).toEqual(["Press {0} to search"]);
  });

  it("supports a leading expression", () => {
    const source = "const a = <p>{name} joined</p>;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}${IMPORT_FRAGMENT}const a = <p>{__tx("{0} joined", [${frag(0, "{name}")}])}</p>;`,
    );
    expect(keys(source)).toEqual(["{0} joined"]);
  });

  it("translates text inside a placeholder element as its own message", () => {
    const source = "const a = <p>See <b>the docs</b> now</p>;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}${IMPORT_FRAGMENT}const a = <p>{__tx("See {0} now", [${frag(0, '<b>{__t("the docs")}</b>')}])}</p>;`,
    );
    expect(keys(source)).toEqual(["See {0} now", "the docs"]);
  });

  it("injects the Fragment import once for several mixed messages", () => {
    const out = run("const a = <p>Hi {a} there</p>;\nconst b = <p>Bye {b} now</p>;")?.code ?? "";
    expect(out.split(IMPORT_FRAGMENT).length - 1).toBe(1);
    expect(out.split(IMPORT_T).length - 1).toBe(1);
    expect(out.split("__tx(").length - 1).toBe(2);
  });

  it("splits runs at line breaks JSX does not render", () => {
    const source = [
      "const a = (",
      "  <Button>",
      "    <PlusIcon />",
      "    New thread",
      "  </Button>",
      ");",
    ].join("\n");
    expect(run(source)?.code).toBe(
      [
        `${IMPORT_T}const a = (`,
        "  <Button>",
        "    <PlusIcon />",
        '    {__t("New thread")}',
        "  </Button>",
        ");",
      ].join("\n"),
    );
  });

  it('does not split at a line break that follows a {" "} continuation', () => {
    const source = ["const a = (", "  <p>", '    Open{" "}', "    <b>x</b>", "  </p>", ");"].join(
      "\n",
    );
    const out = run(source)?.code ?? "";
    expect(out).toContain('__tx("Open {0}"');
    expect(out.split("\n").length).toBe(source.split("\n").length);
    expect(keys(source)).toEqual(["Open {0}", "x"]);
  });

  it("treats string-literal containers as text and skips runs containing braces", () => {
    expect(keys('const a = <p>Save{" "}now</p>;')).toEqual(["Save now"]);
    expect(run("const a = <p>Use &#123;x&#125; here</p>;")).toBeNull();
  });

  it("treats an empty expression container as a boundary", () => {
    expect(keys("const a = <p>One{/* c */}Two</p>;")).toEqual(["One", "Two"]);
  });
});

describe("Visible attributes are rewritten", () => {
  it("rewrites title and leaves className alone", () => {
    expect(run('const a = <button title="Close panel" className="text-sm" />;')?.code).toBe(
      `${IMPORT_T}const a = <button title={__t("Close panel")} className="text-sm" />;`,
    );
  });

  it("rewrites placeholder", () => {
    const source = 'const a = <input placeholder="Search threads" />;';
    expect(run(source)?.code).toBe(
      `${IMPORT_T}const a = <input placeholder={__t("Search threads")} />;`,
    );
    expect(keys(source)).toEqual(["Search threads"]);
  });

  it("turns a template literal into a placeholder message", () => {
    const source = "const a = <button aria-label={`Close ${name}`} />;";
    expect(run(source)?.code).toBe(
      `${IMPORT_T}const a = <button aria-label={__ts("Close {0}", [name])} />;`,
    );
    expect(keys(source)).toEqual(["Close {0}"]);
  });

  it("rewrites an expression container holding a string literal", () => {
    expect(run('const a = <X label={"Name"} tooltip="Hint" alt="Pic" />;')?.code).toBe(
      `${IMPORT_T}const a = <X label={__t("Name")} tooltip={__t("Hint")} alt={__t("Pic")} />;`,
    );
  });

  it("does not rewrite other attributes or strings without letters", () => {
    expect(run('const a = <i data-testid="close-button" className="flex" />;')).toBeNull();
    expect(run('const a = <i title="123" />;')).toBeNull();
    expect(run("const a = <i title={cond ? a : b} />;")).toBeNull();
  });

  it("rewrites nested content inside template values and keeps the line count", () => {
    const source = ["const a = <X", "  title={`One", "  ${n}`}", "/>;", "const b = 1;"].join("\n");
    const out = run(source)?.code ?? "";
    expect(out.split("\n").length).toBe(source.split("\n").length);
    expect(out).toContain(String.raw`__ts("One\n  {0}", [n]`);
  });
});

describe("Notification and confirmation call arguments are rewritten", () => {
  it("translates a toast title at call time and keeps other values", () => {
    const source = 'toastManager.add({ title: "Path copied", description: clipboardPath });';
    expect(run(source, "copy.ts")?.code).toBe(
      `${IMPORT_T}toastManager.add({ title: __t("Path copied"), description: clipboardPath });`,
    );
    expect(keys(source, "copy.ts")).toEqual(["Path copied"]);
  });

  it("does not translate data objects", () => {
    expect(run('createThread({ title: "New thread" });', "a.ts")).toBeNull();
    expect(run('toastManager.update({ title: "New thread" });', "a.ts")).toBeNull();
  });

  it("rewrites the first argument of requestConfirmDialog", () => {
    const source = "await requestConfirmDialog(`Add the backend at ${origin}?`);";
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}await requestConfirmDialog(__ts("Add the backend at {0}?", [origin]));`,
    );
    expect(keys(source, "a.ts")).toEqual(["Add the backend at {0}?"]);
  });

  it("rewrites Dialog.confirm and Dialog.prompt visible properties only", () => {
    const source =
      'Dialog.confirm({ title: "Discard changes?", confirmText: "Discard", destructive: true, id: "discard" });';
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}Dialog.confirm({ title: __t("Discard changes?"), confirmText: __t("Discard"), destructive: true, id: "discard" });`,
    );
    expect(keys(source, "a.ts")).toEqual(["Discard changes?", "Discard"]);
    expect(keys('Dialog.prompt({ message: "Name", cancelText: "Back" });', "a.ts")).toEqual([
      "Name",
      "Back",
    ]);
  });

  it("rewrites both Dialog.alert arguments", () => {
    const source = 'Dialog.alert("Could not open attachment", "Try again.");';
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}Dialog.alert(__t("Could not open attachment"), __t("Try again."));`,
    );
    expect(keys(source, "a.ts")).toEqual(["Could not open attachment", "Try again."]);
  });

  it("leaves non-literal values and unrelated callees alone", () => {
    expect(run("toastManager.add({ title: cond ? a : b });", "a.ts")).toBeNull();
    expect(run('other.add({ title: "Hello" });', "a.ts")).toBeNull();
    expect(run('Dialog.alert(message, "Try again.", "Third");', "a.ts")?.code).toContain(
      '__t("Try again."), "Third"',
    );
  });
});

describe("Exclusions", () => {
  it("upstream-translated content is left alone", () => {
    expect(run("const a = <T>Language</T>;")).toBeNull();
    expect(run("const a = <div><T>Language</T><b>Home</b></div>;")?.code).toBe(
      `${IMPORT_T}const a = <div><T>Language</T><b>{__t("Home")}</b></div>;`,
    );
  });

  it("code, pre and kbd content is left alone", () => {
    expect(run("const a = <code>npm run dev</code>;")).toBeNull();
    expect(run("const a = <pre>some text</pre>;")).toBeNull();
    expect(run("const a = <kbd>Ctrl</kbd>;")).toBeNull();
    expect(run("const a = <Kbd>Ctrl</Kbd>;")).toBeNull();
    expect(run("const a = <Code>npm run dev</Code>;")).toBeNull();
    expect(run("const a = <Pre>some text</Pre>;")).toBeNull();
  });

  it("attributes of excluded elements are rewritten while their content is not", () => {
    const source = 'const a = <pre aria-label="Captured terminal output">some text</pre>;';
    expect(run(source)?.code).toBe(
      `${IMPORT_T}const a = <pre aria-label={__t("Captured terminal output")}>some text</pre>;`,
    );
    expect(keys(source)).toEqual(["Captured terminal output"]);
    expect(run('const a = <T title="Close panel">Language</T>;')?.code).toBe(
      `${IMPORT_T}const a = <T title={__t("Close panel")}>Language</T>;`,
    );
  });

  it("file without UI strings returns null", () => {
    expect(run("export const x = 1;")).toBeNull();
    expect(run('export const a = <div className="a" />;')).toBeNull();
  });

  it("syntax errors return parseFailed", () => {
    expect(run("const a = <div>")).toEqual({ parseFailed: true });
    const throwing = () => {
      throw new Error("boom");
    };
    expect(transformSource("const a = <b>Hi</b>;", "a.tsx", throwing)).toEqual({
      parseFailed: true,
    });
    expect(keys("const a = <div>")).toEqual([]);
  });

  it("test files and node_modules are skipped on both path styles", () => {
    const source = "const a = <b>Hi</b>;";
    expect(run(source, "src/Foo.test.tsx")).toBeNull();
    expect(run(source, String.raw`C:\repo\src\Foo.test.tsx`)).toBeNull();
    expect(run(source, "/repo/node_modules/pkg/index.tsx")).toBeNull();
    expect(run(source, String.raw`C:\repo\node_modules\pkg\index.tsx`)).toBeNull();
    expect(run(source, "src/Foo.tsx")).not.toBeNull();
  });

  it("injects the import after a use directive", () => {
    expect(run('"use client";\nconst a = <b>Hi</b>;')?.code).toBe(
      `"use client";\n${IMPORT_T}const a = <b>{__t("Hi")}</b>;`,
    );
  });
});

describe("collectMessages", () => {
  it("returns keys with 1-based start lines in source order", () => {
    const source = [
      "export function A({ count }) {", // 1
      '  toastManager.add({ title: "Path copied" });', // 2
      "  return (", // 3
      '    <div title="Close panel">', // 4
      "      <p>", // 5
      "        Delete {count} files", // 6
      "        and more", // 7
      "      </p>", // 8
      "      <span>Save</span>", // 9
      "    </div>", // 10
      "  );", // 11
      "}", // 12
    ].join("\n");
    expect(collectMessages(source, "A.tsx", parseSync)).toEqual([
      { key: "Path copied", line: 2 },
      { key: "Close panel", line: 4 },
      { key: "Delete {0} files and more", line: 6 },
      { key: "Save", line: 9 },
    ]);
  });

  it("returns nothing for excluded files", () => {
    expect(collectMessages("const a = <b>Hi</b>;", "a.test.tsx", parseSync)).toEqual([]);
  });
});

describe("Menu item labels are rewritten", () => {
  it("rewrites label inside a function body", () => {
    const source = 'function items() { return [{ id: "pin", label: "Pin thread" }]; }';
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}function items() { return [{ id: "pin", label: __t("Pin thread") }]; }`,
    );
    expect(keys(source, "a.ts")).toEqual(["Pin thread"]);
  });

  it("rewrites a template literal label and works in arrow and method bodies", () => {
    const source = "const f = (name) => ({ label: `Filter by ${name}` });";
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}const f = (name) => ({ label: __ts("Filter by {0}", [name]) });`,
    );
    expect(keys('class A { m() { return { label: "Open" }; } }', "a.ts")).toEqual(["Open"]);
  });

  it("does not rewrite a module-scope label in an unlisted file", () => {
    expect(run('const ACTIONS = [{ label: "Decline" }];', "a.ts")).toBeNull();
  });

  it("rewrites a module-scope label into a getter in a listed file", () => {
    expect(runListed('const ACTIONS = [{ label: "Decline" }];')?.code).toBe(
      `${IMPORT_T}const ACTIONS = [{ get label() { return __t("Decline"); } }];`,
    );
  });

  it("does not rewrite other property names or non-literal values", () => {
    expect(
      run('function items() { return [{ id: "pin", value: "Pin thread" }]; }', "a.ts"),
    ).toBeNull();
    expect(run("function items() { return { label: cond ? a : b }; }", "a.ts")).toBeNull();
  });

  it("does not rewrite labels passed to Command, Query and Action callees", () => {
    const inside = (call: string) => `function f() { ${call}; }`;
    expect(
      run(inside('useAtomCommand(command, { label: "answer link request" })'), "a.ts"),
    ).toBeNull();
    expect(run(inside('useAction({ label: "Running source control action" })'), "a.ts")).toBeNull();
    expect(run(inside('registry.runQuery({ label: "X" })'), "a.ts")).toBeNull();
  });

  it("still rewrites labels for other callees and nested objects of excluded calls", () => {
    expect(keys('function f() { makeMenu({ label: "Pin thread" }); }', "a.ts")).toEqual([
      "Pin thread",
    ]);
    expect(
      keys('function f() { useAction({ label: "Internal", items: [{ label: "Pin" }] }); }', "a.ts"),
    ).toEqual(["Pin"]);
  });

  it("never rewrites the same node twice alongside call-argument rules", () => {
    const source = 'function f() { Dialog.confirm({ title: "A", label: "B" }); }';
    expect(run(source, "a.ts")?.code).toBe(
      `${IMPORT_T}function f() { Dialog.confirm({ title: __t("A"), label: __t("B") }); }`,
    );
    expect(keys(source, "a.ts")).toEqual(["A", "B"]);
  });
});

describe("Runnable item titles are rewritten", () => {
  it("rewrites title and description of an object with run inside a function", () => {
    const source =
      'function f(items) { items.push({ value: "action:triage", title: "Triage an issue", description: "An agent investigates a T3 Code problem", run: () => startTriage() }); }';
    expect(keys(source, "a.ts")).toEqual([
      "Triage an issue",
      "An agent investigates a T3 Code problem",
    ]);
    expect(
      run("function f() { return { title: 'Open pull requests', run: async () => {} }; }", "a.ts")
        ?.code,
    ).toBe(
      `${IMPORT_T}function f() { return { title: __t("Open pull requests"), run: async () => {} }; }`,
    );
  });

  it("accepts method and reference forms of run", () => {
    expect(keys('function f() { return { title: "A title", run() {} }; }', "a.ts")).toEqual([
      "A title",
    ]);
    expect(keys('function f() { return { title: "A title", run: handler }; }', "a.ts")).toEqual([
      "A title",
    ]);
    expect(keys('function f() { return { title: "A title", "run": handler }; }', "a.ts")).toEqual([
      "A title",
    ]);
  });

  it("does not rewrite objects without run or data-call objects", () => {
    expect(run('function f() { return { title: "New thread" }; }', "a.ts")).toBeNull();
    expect(run('function f() { createThread({ title: "New thread" }); }', "a.ts")).toBeNull();
    expect(run("function f() { return { title: cond ? a : b, run: go }; }", "a.ts")).toBeNull();
  });

  it("rewrites a module-scope title into a getter in a listed file", () => {
    expect(runListed('const ITEM = { title: "Change theme", run() {} };')?.code).toBe(
      `${IMPORT_T}const ITEM = { get title() { return __t("Change theme"); }, run() {} };`,
    );
  });

  it("does not rewrite at module scope in an unlisted file or for Command/Query/Action callees", () => {
    expect(run('const ITEM = { title: "Change theme", run() {} };', "a.ts")).toBeNull();
    expect(
      run('function f() { useAction({ title: "Internal name", run: go }); }', "a.ts"),
    ).toBeNull();
  });

  it("rewrites label, title and description once each", () => {
    const source =
      'function f() { return { label: "L", title: "T title", description: "D text", run: go }; }';
    expect(keys(source, "a.ts")).toEqual(["L", "T title", "D text"]);
  });
});

describe("Review fixes: exact string keys and internal callees", () => {
  it("does not rewrite labels passed to *Result callees", () => {
    expect(
      run(
        'function f() { reportAtomCommandResult(result, { label: "cloud account cleanup" }); }',
        "a.ts",
      ),
    ).toBeNull();
  });

  it("keeps newlines and spacing of string and template literals in the key", () => {
    expect(
      keys(
        "function f() { requestConfirmDialog(`Delete ${n}?\n\nThis cannot be undone.`); }",
        "a.ts",
      ),
    ).toEqual(["Delete {0}?\n\nThis cannot be undone."]);
    expect(keys('const a = <i title="  Spaced  " />;')).toEqual(["  Spaced  "]);
    expect(keys(String.raw`toastManager.add({ title: " Two  words\n" });`, "a.ts")).toEqual([
      " Two  words\n",
    ]);
  });

  it("keeps the line count when a template literal key preserves its newlines", () => {
    const source = "requestConfirmDialog(`A ${n}\nB`);\nconst c = 1;";
    const out = run(source, "a.ts")?.code ?? "";
    expect(out.split("\n").length).toBe(source.split("\n").length);
    expect(out).toContain(String.raw`__ts("A {0}\nB", [n]`);
  });

  it("only trims and collapses JSX whitespace, never U+00A0", () => {
    expect(keys("const a = <span>&nbsp;Foo</span>;")).toEqual([" Foo"]);
    expect(run("const a = <span>&nbsp;Foo</span>;")?.code).toContain('__t("\u00a0Foo")');
  });
});

describe("String-literal containers keep their value verbatim", () => {
  it("keeps a newline literal between text and an element in the message", () => {
    const source = String.raw`const a = <p>Nothing yet.{"\n"}Tap <Text>+</Text> to add one.</p>;`;
    expect(keys(source)).toEqual(["Nothing yet.\nTap {0} to add one."]);
    const out = run(source)?.code ?? "";
    expect(out).toContain(String.raw`__tx("Nothing yet.\nTap {0} to add one."`);
    expect(out).toContain(`[${'<__I18nFragment key="i18n-0"><Text>+</Text></__I18nFragment>'}]`);
  });

  it("keeps an edge newline literal outside the call instead of turning it into a space", () => {
    const out = run(String.raw`const a = <p>{"\n"}Hello there{"\n"}</p>;`)?.code ?? "";
    expect(out).toContain(String.raw`<p>{"\n"}{__t("Hello there")}{"\n"}</p>`);
    expect(run(String.raw`const a = <p>{"\nHi"}</p>;`)?.code).toContain(
      String.raw`<p>{"\n"}{__t("Hi")}</p>`,
    );
  });

  it('keeps the {" "} continuation behaviour', () => {
    expect(keys('const a = <p>Save{" "}now</p>;')).toEqual(["Save now"]);
    expect(run('const a = <p>{" "}Save</p>;')?.code).toContain('{" "}{__t("Save")}');
  });
});

describe("Conditional string branches in display positions", () => {
  it.each([
    [
      "const a = <p>{open ? 'Hide details' : 'Show details'}</p>;",
      ["Hide details", "Show details"],
    ],
    ["const a = <p>{error && 'Could not connect'}</p>;", ["Could not connect"]],
    ["const a = <input placeholder={hint ?? 'Search threads'} />;", ["Search threads"]],
    [
      "const a = <b aria-label={a ? 'Pin' : (b ? 'Unpin' : 'Pinned')} />;",
      ["Pin", "Unpin", "Pinned"],
    ],
    ["const a = <p>Status: {ok ? 'Ready' : 'Failed'}</p>;", ["Status: {0}", "Ready", "Failed"]],
    ["const a = <b className={active ? 'font-bold' : 'font-normal'} />;", []],
    ["const a = <b data-state={open ? 'Open' : 'Closed'} />;", []],
    ["function f() { createThread({ title: draft ? 'Draft' : 'New thread' }); }", []],
  ])("collects the branch keys of %s", (source, expected) => {
    expect(keys(source)).toEqual(expected);
    expect(run(source, "Sample.tsx") === null).toBe(expected.length === 0);
  });

  it("rewrites each branch and leaves the condition alone", () => {
    expect(run('const a = <b title={busy ? "Saving…" : "Save"} />;')?.code).toBe(
      `${IMPORT_T}const a = <b title={busy ? __t("Saving…") : __t("Save")} />;`,
    );
    expect(run('const a = <p>{mode === "Plan" ? "Planning" : "Building"}</p>;')?.code).toBe(
      `${IMPORT_T}const a = <p>{mode === "Plan" ? __t("Planning") : __t("Building")}</p>;`,
    );
    expect(run('const a = <p>{error && "Could not connect"}</p>;')?.code).toContain(
      'error && __t("Could not connect")',
    );
    expect(run("const a = <i placeholder={hint ?? `Find ${n}`} />;")?.code).toContain(
      'hint ?? __ts("Find {0}", [n])',
    );
  });

  it("translates branches inside the placeholder of a sentence", () => {
    const out = run('const a = <p>Status: {ok ? "Ready" : "Failed"}</p>;')?.code ?? "";
    expect(out).toContain('__tx("Status: {0}"');
    expect(out).toContain('ok ? __t("Ready") : __t("Failed")');
  });

  it("covers toast, dialog, label and runnable positions and keeps the line count", () => {
    const source = [
      "function f() {",
      '  toastManager.add({ title: ok ? "Done" : "Failed" });',
      '  requestConfirmDialog(a ? "Delete" : "Keep");',
      '  return { label: x || "Fallback", run, title: y ?? "Run it" };',
      "}",
    ].join("\n");
    expect(keys(source, "a.ts")).toEqual([
      "Done",
      "Failed",
      "Delete",
      "Keep",
      "Fallback",
      "Run it",
    ]);
    const out = run(source, "a.ts")?.code ?? "";
    expect(out.split("\n").length).toBe(source.split("\n").length);
  });
});

describe("Module-scope file list", () => {
  const source = 'const A = { label: "Low" };';
  it.each([
    ["apps/web/src/composerPlaceholder.ts", "D:/repo/apps/web/src/composerPlaceholder.ts", true],
    ["apps/web/src/composerPlaceholder.ts", "apps/web/src/composerPlaceholder.ts", true],
    [
      "apps/web/src/composerPlaceholder.ts",
      "D:\\repo\\apps\\web\\src\\composerPlaceholder.ts",
      true,
    ],
    [
      "apps/web/src/composerPlaceholder.ts",
      "D:/repo/apps/web/src/oldcomposerPlaceholder.ts",
      false,
    ],
  ])("matches entry %s against %s: %s", (entry, filename, applies) => {
    const result = transformSource(source, filename, parseSync, { moduleScopeFiles: [entry] });
    expect(result !== null).toBe(applies);
  });

  it("applies nowhere without a list", () => {
    expect(transformSource(source, "apps/web/src/a.ts", parseSync)).toBeNull();
    expect(transformSource(source, "apps/web/src/a.ts", parseSync, {})).toBeNull();
  });

  it("keeps module-scope strings of an unlisted file in English", () => {
    const filename = "apps/web/src/components/settings/customModelEditor.logic.ts";
    const code = 'export const LEVELS = [{ id: "low", label: "Low" }];';
    expect(
      transformSource(code, filename, parseSync, { moduleScopeFiles: ["other/file.ts"] }),
    ).toBeNull();
  });
});

describe("parseModuleScopeList", () => {
  it("parses a valid list and defaults exclude to empty", () => {
    expect(parseModuleScopeList('{"include":["a.ts"],"exclude":{"b.ts":"why"}}')).toEqual({
      include: ["a.ts"],
      exclude: { "b.ts": "why" },
    });
    expect(parseModuleScopeList('{"include":[]}')).toEqual({ include: [], exclude: {} });
  });

  it.each([
    ["broken JSON", "{include:"],
    ["non-object", "[]"],
    ["include not an array", '{"include":"a.ts"}'],
    ["include with non-string", '{"include":["a.ts",1]}'],
    ["exclude value not a string", '{"include":[],"exclude":{"b.ts":1}}'],
  ])("returns null for %s", (_name, text) => {
    expect(parseModuleScopeList(text)).toBeNull();
  });
});

describe("Module-scope display properties become getters", () => {
  const rewrite = (source: string) => runListed(source)?.code ?? null;
  const keysListed = (source: string) =>
    collectMessages(source, "a.ts", parseSync, { moduleScopeFiles: ["a.ts"] }).map((m) => m.key);

  it.each([
    [
      'const X = { decision: "accept", label: "Approve" };',
      `${IMPORT_T}const X = { decision: "accept", get label() { return __t("Approve"); } };`,
      ["Approve"],
    ],
    [
      'const X = { title: "Theme", to: "/settings/appearance" };',
      `${IMPORT_T}const X = { get title() { return __t("Theme"); }, to: "/settings/appearance" };`,
      ["Theme"],
    ],
    [
      'const X = { description: isMac ? "Uses ⌘" : "Uses Ctrl" };',
      `${IMPORT_T}const X = { get description() { return isMac ? __t("Uses ⌘") : __t("Uses Ctrl"); } };`,
      ["Uses ⌘", "Uses Ctrl"],
    ],
    [
      'const X = { "label": "Approve" };',
      `${IMPORT_T}const X = { get label() { return __t("Approve"); } };`,
      ["Approve"],
    ],
    [
      "const X = { hint: `Send ${key}` };",
      `${IMPORT_T}const X = { get hint() { return __ts("Send {0}", [key]); } };`,
      ["Send {0}"],
    ],
    [
      'const X = { list: [{ placeholder: "Search" }] };',
      `${IMPORT_T}const X = { list: [{ get placeholder() { return __t("Search"); } }] };`,
      ["Search"],
    ],
  ])("rewrites %s", (source, expected, expectedKeys) => {
    expect(rewrite(source)).toBe(expected);
    expect(keysListed(source)).toEqual(expectedKeys);
  });

  it.each([
    'const X = { "aria-label": "Close" };',
    "const X = { label };",
    'const X = { [key]: "Theme" };',
    'const X = { name: "Dev server" };',
    'const X = { label() { return "Theme"; } };',
    'const X = { ...base, title: "123" };',
    "const X = { title: someVariable };",
    'const X = makeCommand({ label: "Internal" });',
    'const X = useAction({ title: "Internal" });',
  ])("leaves %s unchanged", (source) => {
    expect(rewrite(source)).toBeNull();
    expect(keysListed(source)).toEqual([]);
  });

  it("keeps function-scope rules unchanged by the list", () => {
    expect(rewrite('function f() { return { label: "Pin" }; }')).toBe(
      `${IMPORT_T}function f() { return { label: __t("Pin") }; }`,
    );
  });

  it("preserves line count for a multi-line template literal", () => {
    const source = "\n\nexport const HELP = {\n  hint: `Press Enter\nto send`,\n};";
    const out = rewrite(source)!;
    expect(out.split("\n")).toHaveLength(source.split("\n").length);
    expect(out.split("\n")[5]).toBe("};");
    expect(out.split("\n")[3]).toContain("get hint()");
    expect(keysListed(source)).toEqual(["Press Enter\nto send"]);
    expect(out).toContain("get hint() { return __t(");
  });

  it("reads the dictionary on every access", () => {
    const body = rewrite('const SETTINGS = [{ id: "theme", title: "Theme", to: "/a" }];')!
      .replace(/^import .*?;/, "")
      .replace("const SETTINGS = ", "return ");
    let locale = "en";
    const dictionary: Record<string, Record<string, string>> = { zh: { Theme: "主題" } };
    const __t = (key: string) => dictionary[locale]?.[key] ?? key;
    const items = new Function("__t", body)(__t) as Array<{ title: string; to: string }>;
    expect(items[0]!.title).toBe("Theme");
    locale = "zh";
    expect(items[0]!.title).toBe("主題");
    expect(items[0]!.to).toBe("/a");
  });
});

describe("Module-scope string constants are rebound on locale change", () => {
  const IMPORT_TB = 'import { __t, __ts, __tx, __tb } from "@t3tools/client-runtime/i18n-overlay";';
  const rewrite = (source: string) => runListed(source)?.code ?? null;
  const keysListed = (source: string) =>
    collectMessages(source, "a.ts", parseSync, { moduleScopeFiles: ["a.ts"] }).map((m) => m.key);

  it.each([
    [
      'export const DEFAULT_COMPOSER_PLACEHOLDER = "Ask anything. @ files, $ skills, / commands";',
      `${IMPORT_TB}export let DEFAULT_COMPOSER_PLACEHOLDER; __tb(() => { DEFAULT_COMPOSER_PLACEHOLDER = __t("Ask anything. @ files, $ skills, / commands"); });`,
      ["Ask anything. @ files, $ skills, / commands"],
    ],
    [
      'const NOTE = "Uses custom intervals.";',
      `${IMPORT_TB}let NOTE; __tb(() => { NOTE = __t("Uses custom intervals."); });`,
      ["Uses custom intervals."],
    ],
    [
      'const HINT = isMac ? "Press ⌘K" : "Press Ctrl K";',
      `${IMPORT_TB}let HINT; __tb(() => { HINT = isMac ? __t("Press ⌘K") : __t("Press Ctrl K"); });`,
      ["Press ⌘K", "Press Ctrl K"],
    ],
    [
      "const GREETING = `Hello ${name}`;",
      `${IMPORT_TB}let GREETING; __tb(() => { GREETING = __ts("Hello {0}", [name]); });`,
      ["Hello {0}"],
    ],
    [
      'const TITLE: string = "Draft";',
      `${IMPORT_TB}let TITLE: string; __tb(() => { TITLE = __t("Draft"); });`,
      ["Draft"],
    ],
  ])("rewrites %s", (source, expected, expectedKeys) => {
    expect(rewrite(source)).toBe(expected);
    expect(keysListed(source)).toEqual(expectedKeys);
  });

  it.each([
    'const A = "One", B = "Two";',
    "const LIMIT = 50;",
    'let TITLE = "Draft";',
    'function f() { const label = "Save"; return label; }',
    'if (flag) { const label = "Save"; }',
    'const { a } = { a: "Save" };',
    'const X = makeName("Save");',
    'const X = "123";',
  ])("leaves %s unchanged", (source) => {
    expect(rewrite(source)).toBeNull();
    expect(keysListed(source)).toEqual([]);
  });

  it("does not rewrite constants of an unlisted file or import __tb", () => {
    const code = 'export const NOTE = "Uses custom intervals.";';
    expect(run(code, "a.ts")).toBeNull();
    expect(transformSource(code, "a.ts", parseSync, { moduleScopeFiles: ["other.ts"] })).toBeNull();
    expect(run("const X = <b>Hi</b>;", "a.tsx")?.code).not.toContain("__tb");
  });

  it("preserves the line count of a multi-line initializer", () => {
    const source = "\n\nexport const HELP =\n  `Press Enter\nto send`;\nconst Z = 1;";
    const out = rewrite(source)!;
    expect(out.split("\n")).toHaveLength(source.split("\n").length);
    expect(out.split("\n").at(-1)).toBe("const Z = 1;");
  });

  it("reads the new value after the runtime rebinds", () => {
    const body = rewrite('const NOTE = "Uses custom intervals.";')!
      .replace(/^import .*?;/, "")
      .concat(" return () => NOTE;");
    let locale = "en";
    const dictionary: Record<string, Record<string, string>> = {
      zh: { "Uses custom intervals.": "使用自訂間隔。" },
    };
    const __t = (key: string) => dictionary[locale]?.[key] ?? key;
    const assigns: Array<() => void> = [];
    const __tb = (assign: () => void) => {
      assigns.push(assign);
      assign();
    };
    const read = new Function("__t", "__tb", body)(__t, __tb) as () => string;
    expect(read()).toBe("Uses custom intervals.");
    locale = "zh";
    for (const assign of assigns) assign();
    expect(read()).toBe("使用自訂間隔。");
  });
});

describe("isOverlaySourceFile", () => {
  const root = "/repo/apps/web/src";

  it("accepts ts and tsx files under the source root, ignoring a query string", () => {
    expect(isOverlaySourceFile("/repo/apps/web/src/a.tsx", root)).toBe(true);
    expect(isOverlaySourceFile("/repo/apps/web/src/a.tsx?tsr-split=component", root)).toBe(true);
    expect(isOverlaySourceFile("/repo/apps/web/src/deep/b.ts", `${root}/`)).toBe(true);
  });

  it("normalizes Windows separators on both arguments", () => {
    expect(
      isOverlaySourceFile(String.raw`D:\repo\apps\web\src\a.ts`, String.raw`D:\repo\apps\web\src`),
    ).toBe(true);
  });

  it("rejects test files, other extensions and paths outside the root", () => {
    expect(isOverlaySourceFile("/repo/apps/web/src/a.test.tsx", root)).toBe(false);
    expect(isOverlaySourceFile("/repo/apps/web/src/a.css", root)).toBe(false);
    expect(isOverlaySourceFile("/repo/apps/web/src/a.js", root)).toBe(false);
    expect(isOverlaySourceFile("/repo/apps/web/srcx/a.ts", root)).toBe(false);
    expect(isOverlaySourceFile("/repo/packages/x/a.ts", root)).toBe(false);
  });
});
