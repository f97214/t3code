// Loaded directly by Node type-stripping and by Metro's CommonJS transformer:
// no runtime imports, no enums/namespaces/parameter properties.

export type ParseSync = (
  filename: string,
  source: string,
) => { program: unknown; errors: readonly unknown[] };

type AstNode = {
  readonly type: string;
  readonly start: number;
  readonly end: number;
} & Readonly<Record<string, unknown>>;

type Render = (start: number, end: number) => string;

interface Edit {
  readonly start: number;
  readonly end: number;
  // [head, tail]: newlines dropped from the replaced range are re-inserted between them.
  readonly build: (render: Render) => readonly [string, string];
}

interface Message {
  readonly key: string;
  readonly start: number;
}

interface Analysis {
  readonly edits: Edit[];
  readonly messages: Message[];
  readonly usesTx: boolean;
  readonly importAt: number;
}

// value is null when the text holds an entity we cannot decode.
type Token =
  | { kind: "text" | "str"; start: number; end: number; value: string | null }
  | { kind: "value"; start: number; end: number }
  | { kind: "cut" };

const LATIN = /\p{Script=Latin}/u;
const JSX_WS = /^[ \t\r\n]*/;
const JSX_WS_END = /[ \t\r\n]*$/;
const EXCLUDED_ELEMENTS = new Set(["code", "pre", "kbd"]);
const VISIBLE_ATTRIBUTES = new Set([
  "title",
  "placeholder",
  "aria-label",
  "aria-description",
  "alt",
  "label",
  "description",
  "tooltip",
]);
const TOAST_PROPERTIES: ReadonlySet<string> = new Set(["title", "description"]);
const DIALOG_PROPERTIES: ReadonlySet<string> = new Set([
  "title",
  "message",
  "confirmText",
  "cancelText",
]);
const INTERNAL_LABEL_CALLEE = /(Command|Query|Action|Result)$/;
const RUNNABLE_PROPERTIES: ReadonlySet<string> = new Set(["title", "description"]);
const LABEL_PROPERTIES: ReadonlySet<string> = new Set(["label"]);
const FUNCTION_TYPES: ReadonlySet<string> = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const isNode = (value: unknown): value is AstNode =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string" &&
  typeof (value as { start?: unknown }).start === "number";

const nodeProp = (node: AstNode, key: string): AstNode | null => {
  const value = node[key];
  return isNode(value) ? value : null;
};

const listProp = (node: AstNode, key: string): AstNode[] => {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
};

// Only JSX whitespace (never U+00A0), and no trimming: callers strip run edges.
const collapseJsxWhitespace = (text: string) => text.replace(/[ \t\r\n]+/g, " ");

const countNewlines = (text: string) => {
  let count = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) count += 1;
  return count;
};

// oxc leaves JSX text undecoded. Returns null for an entity we do not know.
const decodeEntities = (text: string): string | null => {
  if (!text.includes("&")) return text;
  let failed = false;
  const decoded = text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/gi,
    (whole, body: string) => {
      if (body.startsWith("#")) {
        const point =
          body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
        if (Number.isInteger(point) && point >= 0 && point <= 0x10ffff) {
          return String.fromCodePoint(point);
        }
      } else {
        const named = ENTITIES[body];
        if (named !== undefined) return named;
      }
      failed = true;
      return whole;
    },
  );
  return failed ? null : decoded;
};

const isTestFile = (filename: string) => (filename.split(/[\\/]/).at(-1) ?? "").includes(".test.");

const isInNodeModules = (filename: string) => /(^|[\\/])node_modules([\\/]|$)/.test(filename);

const isSpaceLiteral = (token: Token | undefined) =>
  token?.kind === "str" &&
  token.value !== null &&
  JSX_WS.exec(token.value)![0].length === token.value.length;

const PARSE_FAILED = { parseFailed: true } as const;

function analyze(
  code: string,
  filename: string,
  parseSync: ParseSync,
): Analysis | typeof PARSE_FAILED | null {
  if (isTestFile(filename) || isInNodeModules(filename)) return null;
  let parsed: ReturnType<ParseSync>;
  try {
    parsed = parseSync(filename, code);
  } catch {
    return PARSE_FAILED;
  }
  if (parsed.errors.length > 0 || !isNode(parsed.program)) return PARSE_FAILED;

  const edits: Edit[] = [];
  const messages: Message[] = [];
  let usesTx = false;
  // A node claimed by one rule must not be claimed again by another.
  const rewritten = new Set<number>();
  // Object literals passed directly to *Command/*Query/*Action calls hold internal labels.
  const internalLabelObjects = new Set<number>();

  const handleRun = (run: Token[]) => {
    const isBlank = (token: Token) =>
      (token.kind === "text" || token.kind === "str") &&
      token.value !== null &&
      JSX_WS.exec(token.value)![0].length === token.value.length;
    let from = 0;
    let to = run.length;
    while (from < to && isBlank(run[from]!)) from += 1;
    while (to > from && isBlank(run[to - 1]!)) to -= 1;
    const members = run.slice(from, to);
    if (members.length === 0) return;

    const prose: string[] = [];
    for (const token of members) {
      if (token.kind === "text" || token.kind === "str") {
        if (token.value === null) return;
        prose.push(token.value);
      }
    }
    if (!prose.some((text) => LATIN.test(text)) || prose.some((text) => /[{}]/.test(text))) return;
    const first = members[0]!;
    const last = members[members.length - 1]!;
    if (first.kind === "cut" || last.kind === "cut") return;
    const values: Array<{ start: number; end: number }> = [];
    let start = first.start;
    let end = last.end;
    let prefix = "";
    let suffix = "";
    // Only text tokens follow JSX whitespace rules; string-literal containers stay verbatim.
    const pieces = members.map((token) => {
      if (token.kind === "value") {
        values.push(token);
        return `{${values.length - 1}}`;
      }
      if (token.kind === "cut") return "";
      return token.kind === "text" ? collapseJsxWhitespace(token.value!) : token.value!;
    });
    if (first.kind === "text") {
      start += JSX_WS.exec(first.value!)![0].length;
      pieces[0] = pieces[0]!.replace(/^ /, "");
    } else if (first.kind === "str") {
      const lead = JSX_WS.exec(first.value!)![0];
      if (lead.length > 0) prefix = `{${JSON.stringify(lead)}}`;
      pieces[0] = pieces[0]!.slice(lead.length);
    }
    const lastIndex = pieces.length - 1;
    if (last.kind === "text") {
      end -= JSX_WS_END.exec(last.value!)![0].length;
      pieces[lastIndex] = pieces[lastIndex]!.replace(/ $/, "");
    } else if (last.kind === "str") {
      const trail = JSX_WS_END.exec(last.value!)![0];
      if (trail.length > 0) suffix = `{${JSON.stringify(trail)}}`;
      pieces[lastIndex] = pieces[lastIndex]!.slice(0, pieces[lastIndex]!.length - trail.length);
    }
    const message = pieces.join("");

    messages.push({ key: message, start });
    if (values.length === 0) {
      edits.push({
        start,
        end,
        build: () => [`${prefix}{__t(${JSON.stringify(message)})`, `}${suffix}`],
      });
      return;
    }
    usesTx = true;
    edits.push({
      start,
      end,
      build: (render) => {
        const wrapped = values.map(
          (value, index) =>
            `<__I18nFragment key="i18n-${index}">${render(value.start, value.end)}</__I18nFragment>`,
        );
        return [
          `${prefix}{__tx(${JSON.stringify(message)}, [${wrapped.join(", ")}])`,
          `}${suffix}`,
        ];
      },
    });
  };

  const handleChildren = (children: AstNode[]) => {
    const tokens: Token[] = [];
    const cut = () => {
      if (tokens.length > 0 && tokens[tokens.length - 1]!.kind !== "cut") {
        tokens.push({ kind: "cut" });
      }
    };
    for (const child of children) {
      if (child.type === "JSXText") {
        const raw = code.slice(child.start, child.end);
        const lead = JSX_WS.exec(raw)![0];
        if (lead.length === raw.length) {
          if (!raw.includes("\n")) {
            tokens.push({ kind: "text", start: child.start, end: child.end, value: raw });
          } else if (!isSpaceLiteral(tokens[tokens.length - 1])) cut();
          continue;
        }
        const trail = JSX_WS_END.exec(raw)![0];
        const leadBreaks = lead.includes("\n");
        const trailBreaks = trail.includes("\n");
        if (leadBreaks && !isSpaceLiteral(tokens[tokens.length - 1])) cut();
        const start = leadBreaks ? child.start + lead.length : child.start;
        const end = trailBreaks ? child.end - trail.length : child.end;
        tokens.push({ kind: "text", start, end, value: decodeEntities(code.slice(start, end)) });
        if (trailBreaks) cut();
      } else if (child.type === "JSXExpressionContainer") {
        const expression = nodeProp(child, "expression");
        if (expression === null || expression.type === "JSXEmptyExpression") cut();
        else if (expression.type === "Literal" && typeof expression.value === "string") {
          tokens.push({ kind: "str", start: child.start, end: child.end, value: expression.value });
        } else tokens.push({ kind: "value", start: child.start, end: child.end });
      } else if (child.type === "JSXElement" || child.type === "JSXFragment") {
        tokens.push({ kind: "value", start: child.start, end: child.end });
      } else cut();
    }
    let run: Token[] = [];
    for (const token of tokens) {
      if (token.kind === "cut") {
        handleRun(run);
        run = [];
      } else run.push(token);
    }
    handleRun(run);
  };

  // Message for a string literal or template literal; null when not rewritable.
  const stringMessage = (node: AstNode, jsxAttribute: boolean) => {
    let text: string;
    let values: AstNode[] = [];
    if (node.type === "Literal" && typeof node.value === "string") {
      const decoded = jsxAttribute ? decodeEntities(node.value) : node.value;
      if (decoded === null) return null;
      text = decoded;
    } else if (node.type === "TemplateLiteral") {
      const quasis = listProp(node, "quasis");
      values = listProp(node, "expressions");
      text = "";
      for (const [index, quasi] of quasis.entries()) {
        const cooked = (quasi.value as { cooked?: string | null } | undefined)?.cooked;
        if (typeof cooked !== "string") return null;
        if (values.length > 0 && /[{}]/.test(cooked)) return null;
        text += cooked;
        if (index < values.length) text += `{${index}}`;
      }
    } else return null;
    return LATIN.test(text) ? { message: text, values } : null;
  };

  // Replaces `node` with __t / __ts; `wrap` adds JSX braces around the call.
  const rewriteString = (node: AstNode | undefined, jsxAttribute: boolean, wrap: boolean) => {
    if (node === undefined || rewritten.has(node.start)) return;
    const parsedString = stringMessage(node, jsxAttribute);
    if (parsedString === null) return;
    const { message, values } = parsedString;
    rewritten.add(node.start);
    messages.push({ key: message, start: node.start });
    edits.push({
      start: node.start,
      end: node.end,
      build: (render) => {
        const call =
          values.length === 0
            ? `__t(${JSON.stringify(message)}`
            : `__ts(${JSON.stringify(message)}, [${values
                .map((value) => render(value.start, value.end))
                .join(", ")}]`;
        return wrap ? [`{${call})`, "}"] : [call, ")"];
      },
    });
  };

  const handleAttribute = (node: AstNode) => {
    const name = nodeProp(node, "name");
    if (
      name === null ||
      name.type !== "JSXIdentifier" ||
      !VISIBLE_ATTRIBUTES.has(String(name.name))
    ) {
      return;
    }
    const value = nodeProp(node, "value");
    if (value === null) return;
    if (value.type === "Literal") rewriteString(value, true, true);
    else if (value.type === "JSXExpressionContainer") {
      const expression = nodeProp(value, "expression");
      if (expression !== null) rewriteString(expression, false, false);
    }
  };

  const hasRunProperty = (object: AstNode) =>
    listProp(object, "properties").some((property) => {
      if (property.type !== "Property" || property.computed === true) return false;
      const key = nodeProp(property, "key");
      return key?.type === "Identifier"
        ? key.name === "run"
        : key?.type === "Literal" && key.value === "run";
    });

  const rewriteObjectProperties = (argument: AstNode | undefined, names: ReadonlySet<string>) => {
    if (argument === undefined || argument.type !== "ObjectExpression") return;
    for (const property of listProp(argument, "properties")) {
      if (
        property.type !== "Property" ||
        property.computed === true ||
        property.shorthand === true
      ) {
        continue;
      }
      if (property.method === true || property.kind !== "init") continue;
      const key = nodeProp(property, "key");
      const keyName =
        key?.type === "Identifier"
          ? String(key.name)
          : key?.type === "Literal" && typeof key.value === "string"
            ? key.value
            : null;
      const value = nodeProp(property, "value");
      if (keyName !== null && names.has(keyName) && value !== null) {
        rewriteString(value, false, false);
      }
    }
  };

  const handleCall = (node: AstNode) => {
    const callee = nodeProp(node, "callee");
    const args = listProp(node, "arguments");
    if (callee === null) return;
    const calleeName =
      callee.type === "Identifier"
        ? String(callee.name)
        : callee.type === "MemberExpression" && callee.computed !== true
          ? String(nodeProp(callee, "property")?.name ?? "")
          : "";
    if (INTERNAL_LABEL_CALLEE.test(calleeName)) {
      for (const argument of args) {
        if (argument.type === "ObjectExpression") internalLabelObjects.add(argument.start);
      }
    }
    if (callee.type === "Identifier") {
      if (callee.name === "requestConfirmDialog") rewriteString(args[0], false, false);
      return;
    }
    if (callee.type !== "MemberExpression" || callee.computed === true) return;
    const object = nodeProp(callee, "object");
    const property = nodeProp(callee, "property");
    if (object?.type !== "Identifier" || property?.type !== "Identifier") return;
    const target = `${String(object.name)}.${String(property.name)}`;
    if (target === "toastManager.add") {
      for (const argument of args) rewriteObjectProperties(argument, TOAST_PROPERTIES);
    } else if (target === "Dialog.confirm" || target === "Dialog.prompt") {
      for (const argument of args) rewriteObjectProperties(argument, DIALOG_PROPERTIES);
    } else if (target === "Dialog.alert") {
      rewriteString(args[0], false, false);
      rewriteString(args[1], false, false);
    }
  };

  const isSkippedElement = (node: AstNode) => {
    const opening = nodeProp(node, "openingElement");
    const name = opening === null ? null : nodeProp(opening, "name");
    if (name === null || name.type !== "JSXIdentifier") return false;
    const text = String(name.name);
    return text === "T" || EXCLUDED_ELEMENTS.has(text.toLowerCase());
  };

  const walk = (node: unknown, inFunction: boolean) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item, inFunction);
      return;
    }
    if (!isNode(node)) return;
    if (node.type === "JSXElement") {
      if (isSkippedElement(node)) {
        walk(node.openingElement, inFunction);
        return;
      }
      handleChildren(listProp(node, "children"));
    } else if (node.type === "JSXFragment") handleChildren(listProp(node, "children"));
    else if (node.type === "JSXAttribute") handleAttribute(node);
    else if (node.type === "CallExpression") handleCall(node);
    else if (
      node.type === "ObjectExpression" &&
      inFunction &&
      !internalLabelObjects.has(node.start)
    ) {
      rewriteObjectProperties(node, LABEL_PROPERTIES);
      if (hasRunProperty(node)) rewriteObjectProperties(node, RUNNABLE_PROPERTIES);
    }
    const nextInFunction = inFunction || FUNCTION_TYPES.has(node.type);
    for (const key of Object.keys(node)) {
      if (key !== "type") walk(node[key], nextInFunction);
    }
  };
  walk(parsed.program, false);

  const statement = listProp(parsed.program, "body").find(
    (item) => typeof item.directive !== "string",
  );
  return { edits, messages, usesTx, importAt: statement?.start ?? 0 };
}

export function transformSource(
  code: string,
  filename: string,
  parseSync: ParseSync,
): { code: string } | { parseFailed: true; code?: undefined } | null {
  const analysis = analyze(code, filename, parseSync);
  if (analysis === null) return null;
  if ("parseFailed" in analysis) return analysis;
  if (analysis.edits.length === 0) return null;
  const edits = [...analysis.edits].sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  const render: Render = (from, to) => {
    let out = "";
    let position = from;
    while (cursor < edits.length && edits[cursor]!.start < to) {
      const edit = edits[cursor]!;
      cursor += 1;
      if (edit.start < position) continue;
      out += code.slice(position, edit.start);
      const [head, tail] = edit.build(render);
      while (cursor < edits.length && edits[cursor]!.start < edit.end) cursor += 1;
      const original = countNewlines(code.slice(edit.start, edit.end));
      const produced = countNewlines(head) + countNewlines(tail);
      out += head + "\n".repeat(Math.max(0, original - produced)) + tail;
      position = edit.end;
    }
    return out + code.slice(position, to);
  };

  let imports = 'import { __t, __ts, __tx } from "@t3tools/client-runtime/i18n-overlay";';
  if (analysis.usesTx) imports += 'import { Fragment as __I18nFragment } from "react";';
  const at = analysis.importAt;
  return { code: code.slice(0, at) + imports + render(at, code.length) };
}

export function collectMessages(
  code: string,
  filename: string,
  parseSync: ParseSync,
): Array<{ key: string; line: number }> {
  const analysis = analyze(code, filename, parseSync);
  if (analysis === null || "parseFailed" in analysis) return [];
  return [...analysis.messages]
    .sort((a, b) => a.start - b.start)
    .map((message) => ({
      key: message.key,
      line: countNewlines(code.slice(0, message.start)) + 1,
    }));
}

// Shared by the web plugin and the mobile transformer so both pick the same files.
export function isOverlaySourceFile(fileId: string, srcRoot: string): boolean {
  const file = (fileId.split("?")[0] ?? fileId).replaceAll("\\", "/");
  const root = `${srcRoot.replaceAll("\\", "/").replace(/\/+$/, "")}/`;
  return file.startsWith(root) && /\.tsx?$/.test(file) && !isTestFile(file);
}
