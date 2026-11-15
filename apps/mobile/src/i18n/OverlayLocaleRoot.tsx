import { registerOverlayDictionary, setOverlayLocale } from "@t3tools/client-runtime/i18n-overlay";
import overlayZhTW from "@t3tools/client-runtime/i18n-overlay/dictionaries/zh-TW.json";
import { resolveLocale } from "@t3tools/client-runtime/locales";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Fragment, useDeferredValue, type ReactNode } from "react";

import { mobilePreferencesAtom } from "../state/preferences";
import { readSystemLocales, useLanguagePreference } from "./I18nProvider";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./locales";
import { noteRenderedLocale } from "./overlayNavigationState";

registerOverlayDictionary("zh-TW", overlayZhTW);

function LocaleRemount(props: { readonly children: ReactNode }) {
  // Mounted only once preferences loaded, so the first deferred value is the saved language.
  const locale = useDeferredValue(
    resolveLocale(useLanguagePreference(), readSystemLocales(), SUPPORTED_LOCALES, DEFAULT_LOCALE),
  );
  // Render-time on purpose: an effect would run after children already read the dictionary.
  setOverlayLocale(locale);
  noteRenderedLocale(locale);
  return <Fragment key={locale}>{props.children}</Fragment>;
}

/** Activates the overlay dictionary for the saved language and remounts the app when it changes. */
export function OverlayLocaleRoot(props: { readonly children: ReactNode }) {
  // Holding children until the saved language is known avoids an English mount and remount.
  const preferences = useAtomValue(mobilePreferencesAtom);
  if (!AsyncResult.isSuccess(preferences)) return null;
  return <LocaleRemount>{props.children}</LocaleRemount>;
}
