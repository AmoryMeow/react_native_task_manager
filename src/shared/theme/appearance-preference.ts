import type { ColorSchemeName } from "./palette";

export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const;
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

export const APPEARANCE_STORAGE_KEY = "appearance-preference";
const DEFAULT_PREFERENCE: AppearancePreference = "system";

export function parseAppearancePreference(
  value: unknown,
): AppearancePreference {
  return APPEARANCE_PREFERENCES.includes(value as AppearancePreference)
    ? (value as AppearancePreference)
    : DEFAULT_PREFERENCE;
}

export function resolveColorScheme(
  preference: AppearancePreference,
  systemScheme: string | null | undefined,
): ColorSchemeName {
  if (preference !== "system") return preference;

  return systemScheme === "dark" ? "dark" : "light";
}

export interface PreferenceStorage {
  getItemSync: (key: string) => string | null;
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

export function readStoredPreferenceSync(
  storage: PreferenceStorage,
): AppearancePreference | null {
  try {
    return parseAppearancePreference(
      storage.getItemSync(APPEARANCE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export async function readStoredPreference(
  storage: PreferenceStorage,
): Promise<AppearancePreference> {
  try {
    return parseAppearancePreference(
      await storage.getItem(APPEARANCE_STORAGE_KEY),
    );
  } catch (error) {
    console.error("Failed to read appearance preference", error);
    return DEFAULT_PREFERENCE;
  }
}

export interface AppearanceEnvironment {
  platform: string;
  setColorScheme: (scheme: AppearancePreference) => void;
  getSystemColorScheme: () => string | null | undefined;
  addSystemColorSchemeListener: (
    listener: (scheme: string | null | undefined) => void,
  ) => { remove: () => void };
}

export function createAppearanceController(environment: AppearanceEnvironment) {
  let systemSubscription: { remove: () => void } | null = null;

  function stopFollowingSystem() {
    systemSubscription?.remove();
    systemSubscription = null;
  }

  return {
    apply(preference: AppearancePreference) {
      stopFollowingSystem();

      if (environment.platform !== "web") {
        environment.setColorScheme(preference);
        return;
      }

      if (preference !== "system") {
        environment.setColorScheme(preference);
        return;
      }

      environment.setColorScheme(
        resolveColorScheme("system", environment.getSystemColorScheme()),
      );
      systemSubscription = environment.addSystemColorSchemeListener(
        (scheme) => {
          environment.setColorScheme(resolveColorScheme("system", scheme));
        },
      );
    },
  };
}
