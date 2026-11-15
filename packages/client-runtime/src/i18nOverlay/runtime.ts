const dictionaries = new Map<string, ReadonlyMap<string, string>>();
const loaders: Readonly<
  Record<string, () => Promise<{ default: Readonly<Record<string, string>> }>>
> = {
  "zh-TW": () => import("./dictionaries/zh-TW.json"),
};
const loading = new Map<string, Promise<void>>();

// null means English or no dictionary: lookups return the key untouched.
let activeDictionary: ReadonlyMap<string, string> | null = null;
let activeLocale = "en";

const isEnglish = (locale: string) => locale === "en" || locale.startsWith("en-");

const assigners: Array<() => void> = [];

const syncActive = () => {
  const next = isEnglish(activeLocale) ? null : (dictionaries.get(activeLocale) ?? null);
  if (next === activeDictionary) return;
  activeDictionary = next;
  // One failing assigner must not leave later ones on the old locale or reject a dictionary load.
  for (const assign of assigners) {
    try {
      assign();
    } catch (error) {
      // @effect-diagnostics-next-line globalConsole:off -- Runs in compiled UI modules, outside any Effect runtime.
      console.error("[t3code] i18n overlay rebind failed", error);
    }
  }
};

export const setOverlayLocale = (locale: string): void => {
  activeLocale = locale;
  syncActive();
};

export const registerOverlayDictionary = (
  locale: string,
  dictionary: Readonly<Record<string, string>>,
): void => {
  dictionaries.set(locale, new Map(Object.entries(dictionary)));
  syncActive();
};

export const hasOverlayDictionary = (locale: string): boolean => dictionaries.has(locale);

export const loadOverlayDictionary = (locale: string): Promise<void> => {
  const loader = Object.hasOwn(loaders, locale) ? loaders[locale] : undefined;
  if (!loader) return Promise.resolve();
  const existing = loading.get(locale);
  if (existing) return existing;
  const pending = loader().then(
    (module) => registerOverlayDictionary(locale, module.default),
    () => {
      // Failed loads stay untranslated (English) and may be retried.
      loading.delete(locale);
    },
  );
  loading.set(locale, pending);
  return pending;
};

export const __t = (key: string): string => activeDictionary?.get(key) ?? key;

export const __tb = (assign: () => void): void => {
  assigners.push(assign);
  assign();
};

const PLACEHOLDER = /\{(\d+)\}/g;

export const __ts = (key: string, values: readonly unknown[]): string =>
  __t(key).replace(PLACEHOLDER, (_match, index: string) => String(values[Number(index)]));

export const __tx = <V>(key: string, values: readonly V[]): Array<string | V> => {
  const message = __t(key);
  const parts: Array<string | V> = [];
  let last = 0;
  for (const match of message.matchAll(PLACEHOLDER)) {
    if (match.index > last) parts.push(message.slice(last, match.index));
    parts.push(values[Number(match[1])] as V);
    last = match.index + match[0].length;
  }
  if (last < message.length) parts.push(message.slice(last));
  return parts;
};
