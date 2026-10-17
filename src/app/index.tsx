import * as Crypto from "expo-crypto";
import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSQLiteContext } from "expo-sqlite";

import type { Task } from "@/entities/task/model/types";

export default function HomeScreen() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");

  const remainingTasks = tasks.filter((task) => task.status !== "done").length;

  const db = useSQLiteContext();

  const addTask = () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) return;

    const now = new Date().toISOString();

    const task: Task = {
      id: Crypto.randomUUID(),
      title: trimmedTitle,
      status: "todo",
      schedule: { type: "inbox" },
      createdAt: now,
      updatedAt: now,
    };

    setTasks((prev) => [...prev, task]);
    setTitle("");
  };

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;

        const isDone = task.status === "done";
        const now = new Date().toISOString();

        return {
          ...task,
          status: isDone ? "todo" : "done",
          completedAt: isDone ? undefined : now,
          updatedAt: now,
        };
      }),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-zinc-100">
      <View className="flex-1 px-5 pt-6">
        <View className="mb-6 flex-row items-end justify-between">
          <View>
            <Text className="mb-1 text-xs font-semibold uppercase tracking-[2px] text-zinc-500">
              Focus
            </Text>
            <Text className="text-4xl font-bold tracking-tight text-zinc-950">
              My Tasks
            </Text>
          </View>

          <View className="rounded-full border border-zinc-300 bg-white px-3 py-1.5">
            <Text className="text-xs font-semibold text-zinc-600">
              {remainingTasks} open
            </Text>
          </View>
        </View>

        <View className="mb-6 flex-row gap-2">
          <TextInput
            className="h-12 flex-1 rounded-2xl border border-zinc-300 bg-white px-4 text-base text-zinc-950"
            value={title}
            onChangeText={setTitle}
            placeholder="Add a small next step"
            placeholderTextColor="#71717a"
            selectionColor="#18181b"
            onSubmitEditing={addTask}
            returnKeyType="done"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add task"
            className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 active:bg-zinc-700"
            onPress={addTask}
          >
            <Text className="text-2xl font-light leading-7 text-white">+</Text>
          </Pressable>
        </View>

        <FlatList
          className="flex-1"
          contentContainerClassName="grow pb-6"
          data={tasks}
          keyExtractor={(task) => task.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isDone = item.status === "done";

            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isDone }}
                className="mb-2 min-h-14 flex-row items-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 active:bg-zinc-50"
                onPress={() => toggleTask(item.id)}
              >
                <View
                  className={
                    isDone
                      ? "mr-3 h-5 w-5 items-center justify-center rounded-md bg-zinc-950"
                      : "mr-3 h-5 w-5 rounded-md border-2 border-zinc-400"
                  }
                >
                  {isDone && (
                    <Text className="text-xs font-bold text-white">✓</Text>
                  )}
                </View>

                <Text
                  className={
                    isDone
                      ? "flex-1 text-base text-zinc-400 line-through"
                      : "flex-1 text-base text-zinc-900"
                  }
                >
                  {item.title}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8 pb-24">
              <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-zinc-300 bg-white">
                <Text className="text-2xl text-zinc-700">✓</Text>
              </View>
              <Text className="mb-2 text-center text-lg font-semibold text-zinc-900">
                Clear space for focus
              </Text>
              <Text className="text-center text-sm leading-5 text-zinc-500">
                Add one small task to get started.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}
