import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import type { Task } from "../../entities/task/model/types";
import { createTaskRepository } from "../../entities/task/repository/task-repository";

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "title" | "description" | null
  >(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const titleSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const descriptionSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const titleDraftRef = useRef("");
  const descriptionDraftRef = useRef("");
  const savedTitleRef = useRef("");
  const savedDescriptionRef = useRef("");

  useEffect(() => {
    let active = true;

    async function loadTask() {
      try {
        const repository = createTaskRepository(db);
        const result = await repository.getTaskById(id);

        if (active) {
          setTask(result);
          const loadedTitle = result?.title ?? "";
          const loadedDescription = result?.description ?? "";

          setTitle(loadedTitle);
          setDescription(loadedDescription);
          titleDraftRef.current = loadedTitle;
          descriptionDraftRef.current = loadedDescription;
          savedTitleRef.current = loadedTitle;
          savedDescriptionRef.current = loadedDescription;
        }
      } catch (error) {
        console.error("Failed to load task", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadTask();

    return () => {
      active = false;
    };
  }, [db, id]);

  function saveTitle(): Promise<boolean> {
    if (titleSavePromiseRef.current) {
      return titleSavePromiseRef.current.then((saved) =>
        saved ? saveTitle() : false,
      );
    }

    const trimmedTitle = titleDraftRef.current.trim();

    if (!task || !trimmedTitle) {
      return Promise.resolve(false);
    }

    if (trimmedTitle === savedTitleRef.current) {
      titleDraftRef.current = trimmedTitle;
      setTitle(trimmedTitle);
      return Promise.resolve(true);
    }

    const savePromise = createTaskRepository(db)
      .updateTaskTitle(task, trimmedTitle)
      .then((updatedTask) => {
        savedTitleRef.current = updatedTask.title;
        if (titleDraftRef.current.trim() === updatedTask.title) {
          titleDraftRef.current = updatedTask.title;
          setTitle(updatedTask.title);
        }
        setTask((current) =>
          current
            ? {
                ...current,
                title: updatedTask.title,
                updatedAt: updatedTask.updatedAt,
              }
            : current,
        );
        return true;
      })
      .catch((error) => {
        console.error("Failed to save task title", error);
        return false;
      })
      .finally(() => {
        titleSavePromiseRef.current = null;
      });

    titleSavePromiseRef.current = savePromise;
    return savePromise;
  }

  function saveDescription(): Promise<boolean> {
    if (descriptionSavePromiseRef.current) {
      return descriptionSavePromiseRef.current.then((saved) =>
        saved ? saveDescription() : false,
      );
    }

    if (!task || descriptionDraftRef.current === savedDescriptionRef.current) {
      return Promise.resolve(true);
    }

    const nextDescription = descriptionDraftRef.current;
    const savePromise = createTaskRepository(db)
      .updateTaskDescription(task.id, nextDescription)
      .then(() => {
        savedDescriptionRef.current = nextDescription;
        setTask((current) =>
          current ? { ...current, description: nextDescription } : current,
        );
        return true;
      })
      .catch((error) => {
        console.error("Failed to save task description", error);
        return false;
      })
      .finally(() => {
        descriptionSavePromiseRef.current = null;
      });

    descriptionSavePromiseRef.current = savePromise;
    return savePromise;
  }

  async function saveChanges(): Promise<boolean> {
    if (!titleDraftRef.current.trim()) {
      return false;
    }

    const titleSaved = await saveTitle();
    const descriptionSaved = await saveDescription();

    return titleSaved && descriptionSaved;
  }

  async function handleDone() {
    if (saving) return;

    if (!titleDraftRef.current.trim()) {
      Alert.alert("Title required", "Task title cannot be empty.");
      return;
    }

    setSaving(true);

    const saved = await saveChanges();

    if (saved) {
      router.back();
    } else {
      setSaving(false);
      Alert.alert(
        "Couldn't save",
        "Your changes weren't saved. Please try again.",
      );
    }
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View className="flex-1 bg-white px-5 pt-6">
        <View className="mb-6 flex-row items-center justify-between">
          <Text className="text-lg font-semibold">Task details</Text>

          <Pressable
            onPress={() => void handleDone()}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text className="text-blue-600">
              {saving ? "Saving..." : "Done"}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator />
        ) : task ? (
          <View className="gap-5">
            <View className="gap-1.5">
              <Text className="ml-1 text-xs font-medium text-zinc-500">
                Title
              </Text>
              <TextInput
                accessibilityLabel="Task title"
                value={title}
                onChangeText={(value) => {
                  titleDraftRef.current = value;
                  setTitle(value);
                }}
                onFocus={() => setFocusedField("title")}
                onBlur={() => {
                  setFocusedField(null);
                  void saveTitle();
                }}
                onSubmitEditing={() => descriptionInputRef.current?.focus()}
                editable={!saving}
                placeholder="Task title"
                placeholderTextColor="#a1a1aa"
                returnKeyType="next"
                selectionColor="#18181b"
                className={`min-h-12 rounded-xl border bg-zinc-50 px-3.5 py-2.5 text-lg font-semibold text-zinc-950 ${
                  focusedField === "title"
                    ? "border-zinc-500"
                    : "border-zinc-200"
                }`}
              />
            </View>

            <View className="gap-1.5">
              <Text className="ml-1 text-xs font-medium text-zinc-500">
                Description
              </Text>
              <TextInput
                ref={descriptionInputRef}
                accessibilityLabel="Task description"
                multiline
                value={description}
                onChangeText={(value) => {
                  descriptionDraftRef.current = value;
                  setDescription(value);
                }}
                onFocus={() => setFocusedField("description")}
                onBlur={() => {
                  setFocusedField(null);
                  void saveDescription();
                }}
                editable={!saving}
                placeholder="Add description..."
                placeholderTextColor="#a1a1aa"
                selectionColor="#18181b"
                textAlignVertical="top"
                className={`min-h-24 rounded-xl border bg-zinc-50 p-3 text-base text-zinc-800 ${
                  focusedField === "description"
                    ? "border-zinc-500"
                    : "border-zinc-200"
                }`}
              />
            </View>
          </View>
        ) : (
          <Text className="text-zinc-500">Task not found</Text>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}
