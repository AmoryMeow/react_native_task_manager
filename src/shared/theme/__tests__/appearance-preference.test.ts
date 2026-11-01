import {
  APPEARANCE_STORAGE_KEY,
  createAppearanceController,
  parseAppearancePreference,
  readStoredPreference,
  readStoredPreferenceSync,
  resolveColorScheme,
  type AppearanceEnvironment,
  type PreferenceStorage,
} from "../appearance-preference";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: PreferenceStorage = {
    getItemSync: (key) => values.get(key) ?? null,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
  };

  return { storage, values };
}

function createEnvironment(platform: string, systemScheme = "light") {
  let system: string | null = systemScheme;
  const listeners = new Set<(scheme: string | null) => void>();
  const applied: string[] = [];
  const environment: AppearanceEnvironment = {
    platform,
    setColorScheme: (scheme) => applied.push(scheme),
    getSystemColorScheme: () => system,
    addSystemColorSchemeListener: (listener) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };

  return {
    environment,
    applied,
    listenerCount: () => listeners.size,
    changeSystemScheme(next: string | null) {
      system = next;
      listeners.forEach((listener) => listener(next));
    },
  };
}

describe("parseAppearancePreference", () => {
  test.each(["system", "light", "dark"])("accepts %s", (value) => {
    expect(parseAppearancePreference(value)).toBe(value);
  });

  test.each([null, undefined, "", "Dark", "auto", 1, {}])(
    "falls back to system for %p",
    (value) => {
      expect(parseAppearancePreference(value)).toBe("system");
    },
  );
});

describe("resolveColorScheme", () => {
  test("a manual choice overrides the system", () => {
    expect(resolveColorScheme("dark", "light")).toBe("dark");
    expect(resolveColorScheme("light", "dark")).toBe("light");
  });

  test("system follows the platform and defaults to light", () => {
    expect(resolveColorScheme("system", "dark")).toBe("dark");
    expect(resolveColorScheme("system", "light")).toBe("light");
    expect(resolveColorScheme("system", null)).toBe("light");
    expect(resolveColorScheme("system", "unspecified")).toBe("light");
  });
});

describe("stored preference", () => {
  test("defaults to system when nothing is saved", async () => {
    const { storage } = createStorage();

    expect(readStoredPreferenceSync(storage)).toBe("system");
    await expect(readStoredPreference(storage)).resolves.toBe("system");
  });

  test("restores a saved preference", async () => {
    const { storage } = createStorage({ [APPEARANCE_STORAGE_KEY]: "dark" });

    expect(readStoredPreferenceSync(storage)).toBe("dark");
    await expect(readStoredPreference(storage)).resolves.toBe("dark");
  });

  test("ignores an invalid stored value", async () => {
    const { storage } = createStorage({
      [APPEARANCE_STORAGE_KEY]: "midnight",
    });

    expect(readStoredPreferenceSync(storage)).toBe("system");
    await expect(readStoredPreference(storage)).resolves.toBe("system");
  });

  test("reports an unavailable synchronous read and falls back on async errors", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const storage: PreferenceStorage = {
      getItemSync: () => {
        throw new Error("not supported");
      },
      getItem: async () => {
        throw new Error("disk I/O error");
      },
      setItem: async () => undefined,
    };

    expect(readStoredPreferenceSync(storage)).toBeNull();
    await expect(readStoredPreference(storage)).resolves.toBe("system");
  });
});

describe("createAppearanceController on native", () => {
  test("passes the preference straight to the platform", () => {
    const env = createEnvironment("ios");
    const controller = createAppearanceController(env.environment);

    controller.apply("dark");
    controller.apply("system");
    controller.apply("light");

    expect(env.applied).toEqual(["dark", "system", "light"]);
    expect(env.listenerCount()).toBe(0);
  });
});

describe("createAppearanceController on web", () => {
  test("system resolves from the browser and follows its changes", () => {
    const env = createEnvironment("web", "dark");
    const controller = createAppearanceController(env.environment);

    controller.apply("system");
    env.changeSystemScheme("light");
    env.changeSystemScheme("dark");

    expect(env.applied).toEqual(["dark", "light", "dark"]);
  });

  test("a manual override ignores later system changes", () => {
    const env = createEnvironment("web", "light");
    const controller = createAppearanceController(env.environment);

    controller.apply("system");
    controller.apply("dark");
    env.changeSystemScheme("light");

    expect(env.applied).toEqual(["light", "dark"]);
    expect(env.listenerCount()).toBe(0);
  });

  test("switching back to system starts following the browser again", () => {
    const env = createEnvironment("web", "light");
    const controller = createAppearanceController(env.environment);

    controller.apply("light");
    controller.apply("system");
    controller.apply("system");
    env.changeSystemScheme("dark");

    expect(env.applied).toEqual(["light", "light", "light", "dark"]);
    expect(env.listenerCount()).toBe(1);
  });
});
