import type { NavigationState } from "@react-navigation/native";

import { rootNavigationRef } from "../lib/rootNavigation";

let renderedLocale: string | undefined;
let stateToRestore: NavigationState | undefined;

/** Saves the navigation state when the rendered language changes, before the container remounts. */
export function noteRenderedLocale(locale: string): void {
  if (renderedLocale !== undefined && renderedLocale !== locale && rootNavigationRef.isReady()) {
    stateToRestore = rootNavigationRef.getRootState();
  }
  renderedLocale = locale;
}

/** The state saved by the last language change, for the remounted container. */
export function takeOverlayNavigationState(): NavigationState | undefined {
  const state = stateToRestore;
  stateToRestore = undefined;
  return state;
}
