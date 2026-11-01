import { colorScheme } from "nativewind";
import { Appearance, Platform } from "react-native";

import {
  APPEARANCE_STORAGE_KEY,
  createAppearanceController,
  readStoredPreference,
  readStoredPreferenceSync,
  type AppearancePreference,
} from "./appearance-preference";
import { preferenceStorage } from "./preference-storage";

export type { AppearancePreference } from "./appearance-preference";

const controller = createAppearanceController({
  platform: Platform.OS,
  setColorScheme: (scheme) => colorScheme.set(scheme),
  getSystemColorScheme: () => Appearance.getColorScheme(),
  addSystemColorSchemeListener: (listener) =>
    Appearance.addChangeListener(({ colorScheme: scheme }) => listener(scheme)),
});

export function initializeAppearance() {
  if (Platform.OS === "web" && typeof window === "undefined") return;

  const stored = readStoredPreferenceSync(preferenceStorage);

  if (stored) {
    controller.apply(stored);
    return;
  }

  controller.apply("system");
  void readStoredPreference(preferenceStorage).then((preference) => {
    if (preference !== "system") controller.apply(preference);
  });
}

export function getAppearancePreference(): Promise<AppearancePreference> {
  return readStoredPreference(preferenceStorage);
}

export async function setAppearancePreference(
  preference: AppearancePreference,
) {
  controller.apply(preference);
  await preferenceStorage.setItem(APPEARANCE_STORAGE_KEY, preference);
}
