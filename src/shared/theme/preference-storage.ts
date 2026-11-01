import Storage from "expo-sqlite/kv-store";

import type { PreferenceStorage } from "./appearance-preference";

export const preferenceStorage: PreferenceStorage = Storage;
