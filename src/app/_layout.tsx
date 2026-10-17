import { Stack } from "expo-router";
import { SQLiteProvider } from "expo-sqlite";

import { migrateDb } from "../shared/db/migrations";

import "../global.css";

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="tasks.db" onInit={migrateDb} useSuspense>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </SQLiteProvider>
  );
}
