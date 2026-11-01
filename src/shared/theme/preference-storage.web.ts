import type { PreferenceStorage } from "./appearance-preference";

function getLocalStorage() {
  if (typeof window === "undefined") {
    throw new Error("localStorage is not available");
  }

  return window.localStorage;
}

export const preferenceStorage: PreferenceStorage = {
  getItemSync: (key) => getLocalStorage().getItem(key),
  getItem: async (key) => getLocalStorage().getItem(key),
  setItem: async (key, value) => getLocalStorage().setItem(key, value),
};
