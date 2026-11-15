import { parseSync } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";

import { collectMessages, isOverlaySourceFile, transformSource } from "./transform.ts";

const IMPORT_T = 'import { __t, __ts, __tx } from "@t3tools/client-runtime/i18n-overlay";';
const IMPORT_FRAGMENT = 'import { Fragment as __I18nFragment } from "react";';

const run = (code: string, filename = "Sample.tsx") => transformSource(code, filename, parseSync);
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
    expect(run("const a = <i title={cond ? 'A' : 'B'} />;")).toBeNull();
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
    expect(run('toastManager.add({ title: cond ? "A" : "B" });', "a.ts")).toBeNull();
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

  it("does not rewrite a module-scope label", () => {
    expect(run('const ACTIONS = [{ label: "Decline" }];', "a.ts")).toBeNull();
  });

  it("does not rewrite other property names or non-literal values", () => {
    expect(
      run('function items() { return [{ id: "pin", value: "Pin thread" }]; }', "a.ts"),
    ).toBeNull();
    expect(run('function items() { return { label: cond ? "A" : "B" }; }', "a.ts")).toBeNull();
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
    expect(run('function f() { return { title: cond ? "A" : "B", run: go }; }', "a.ts")).toBeNull();
  });

  it("does not rewrite at module scope or for Command/Query/Action callees", () => {
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
