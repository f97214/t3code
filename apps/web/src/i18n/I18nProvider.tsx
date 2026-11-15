import { GTProvider } from "gt-react";
import { Fragment, useSyncExternalStore, type ReactNode } from "react";

import { getI18nSnapshot, persistGTLocale, subscribeI18n } from "./runtime";

const reloadToSetting = (state: { readonly locale: string }) => persistGTLocale(state.locale);

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const { locale, translations, overlayReady } = useSyncExternalStore(
    subscribeI18n,
    getI18nSnapshot,
  );
  return (
    <GTProvider locale={locale} translations={translations} _reload={reloadToSetting}>
      <Fragment key={`${locale}:${overlayReady}`}>{children}</Fragment>
    </GTProvider>
  );
}
