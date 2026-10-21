import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";

import { toLocalDateString } from "../../entities/task/lib/format-task-schedule";
import type { Task, TaskSchedule } from "../../entities/task/model/types";
import { createTaskRepository } from "../../entities/task/repository/task-repository";
import { CalendarIcon } from "../../shared/ui/icons/calendar-icon";

type ScheduleOption = "inbox" | "today" | "tomorrow" | "soon" | "someday";

const scheduleOptions: { label: string; value: ScheduleOption }[] = [
  { label: "Inbox", value: "inbox" },
  { label: "Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "Soon", value: "soon" },
  { label: "Someday", value: "someday" },
];

const DEFAULT_SHEET_DETENTS = [0.5, 0.9];
const EXPANDED_SHEET_DETENTS = [0.9];

function toTaskSchedule(option: ScheduleOption): TaskSchedule {
  if (option === "today" || option === "tomorrow") {
    const date = new Date();

    if (option === "tomorrow") {
      date.setDate(date.getDate() + 1);
    }

    return { type: "date", date: toLocalDateString(date) };
  }

  return { type: option };
}

function toLocalDate(schedule: TaskSchedule): Date {
  if (schedule.type !== "date") return new Date();

  const [year, month, day] = schedule.date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatSelectedDate(schedule: TaskSchedule): string {
  if (schedule.type !== "date") return "Not set";

  return toLocalDate(schedule).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function schedulesMatch(left: TaskSchedule, right: TaskSchedule): boolean {
  if (left.type !== right.type) return false;

  return (
    left.type !== "date" || (right.type === "date" && left.date === right.date)
  );
}

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [draftScheduleDate, setDraftScheduleDate] = useState(() => new Date());
  const [focusedField, setFocusedField] = useState<
    "title" | "description" | null
  >(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const titleSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const descriptionSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const scheduleSavePromiseRef = useRef<Promise<Task> | null>(null);
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

          if (result?.schedule.type === "date") {
            setDraftScheduleDate(toLocalDate(result.schedule));
          }

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
    if (saving || scheduleSavePromiseRef.current) return;

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

  function saveSchedule(
    nextSchedule: TaskSchedule,
    closeDatePickerAfterSave = false,
  ) {
    if (!task || saving || scheduleSavePromiseRef.current) return;

    if (schedulesMatch(task.schedule, nextSchedule)) {
      if (closeDatePickerAfterSave) setDatePickerOpen(false);
      return;
    }

    setScheduleSaving(true);

    const savePromise = createTaskRepository(db).updateTaskSchedule(
      task.id,
      nextSchedule,
    );

    scheduleSavePromiseRef.current = savePromise;

    void savePromise
      .then((updatedTask) => {
        setTask(updatedTask);

        if (updatedTask.schedule.type === "date") {
          setDraftScheduleDate(toLocalDate(updatedTask.schedule));
        }

        if (closeDatePickerAfterSave) setDatePickerOpen(false);
      })
      .catch((error) => {
        console.error("Failed to update task schedule", error);
        Alert.alert(
          "Couldn't update schedule",
          "The schedule wasn't changed. Please try again.",
        );
      })
      .finally(() => {
        scheduleSavePromiseRef.current = null;
        setScheduleSaving(false);
      });
  }

  function openDatePicker() {
    if (!task || isBusy || (datePickerOpen && Platform.OS === "ios")) return;

    const initialDate = draftScheduleDate;

    Keyboard.dismiss();
    setDraftScheduleDate(initialDate);
    setDatePickerOpen(true);

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        display: "calendar",
        onValueChange: (_event, selectedDate) => {
          setDraftScheduleDate(selectedDate);
        },
        onDismiss: () => setDatePickerOpen(false),
      });
    }
  }

  function selectSchedule(option: ScheduleOption) {
    setDatePickerOpen(false);
    saveSchedule(toTaskSchedule(option));
  }

  function applyPickedDate() {
    saveSchedule(
      { type: "date", date: toLocalDateString(draftScheduleDate) },
      true,
    );
  }

  const isBusy = saving || scheduleSaving;

  return (
    <>
      <Stack.Screen
        options={{
          sheetAllowedDetents: datePickerOpen
            ? EXPANDED_SHEET_DETENTS
            : DEFAULT_SHEET_DETENTS,
        }}
      />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View className="flex-1 bg-white px-5 pt-6">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-lg font-semibold">Task details</Text>

            <Pressable
              onPress={() => void handleDone()}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityState={{ disabled: isBusy }}
            >
              <Text className="text-blue-600">
                {isBusy ? "Saving..." : "Done"}
              </Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator />
          ) : task ? (
            <ScrollView
              ref={contentScrollRef}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-5 pb-8"
            >
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
                  editable={!isBusy}
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
                  editable={!isBusy}
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

              <View className="gap-1.5">
                <Text className="ml-1 text-xs font-medium text-zinc-500">
                  Schedule
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  className="h-8 flex-none"
                  contentContainerClassName="items-center gap-1.5 pr-2"
                >
                  {scheduleOptions.map((option) => {
                    const isSelected = schedulesMatch(
                      task.schedule,
                      toTaskSchedule(option.value),
                    );

                    return (
                      <Pressable
                        key={option.value}
                        accessibilityRole="button"
                        accessibilityState={{
                          selected: isSelected,
                          disabled: isBusy,
                        }}
                        disabled={isBusy}
                        onPress={() => {
                          Keyboard.dismiss();
                          selectSchedule(option.value);
                        }}
                        className={`${
                          isSelected
                            ? "rounded-full bg-zinc-950 px-3 py-1.5"
                            : "rounded-full border border-zinc-300 bg-white px-3 py-1.5 active:bg-zinc-100"
                        } ${isBusy ? "opacity-40" : ""}`}
                      >
                        <Text
                          className={
                            isSelected
                              ? "text-xs font-semibold text-white"
                              : "text-xs font-medium text-zinc-600"
                          }
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Choose a date, ${formatSelectedDate(task.schedule)}`}
                  accessibilityState={{
                    disabled: isBusy,
                    expanded: datePickerOpen,
                  }}
                  disabled={isBusy}
                  onPress={openDatePicker}
                  className={`mt-1 h-12 flex-row items-center justify-between rounded-xl border px-3.5 ${
                    datePickerOpen
                      ? "border-zinc-500 bg-zinc-50"
                      : "border-zinc-200 bg-white active:bg-zinc-50"
                  } ${isBusy ? "opacity-40" : ""}`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <CalendarIcon />
                    <Text className="text-sm font-medium text-zinc-800">
                      Choose a date
                    </Text>
                  </View>

                  <Text
                    numberOfLines={1}
                    className="ml-3 flex-shrink text-sm text-zinc-500"
                  >
                    {formatSelectedDate(task.schedule)}
                  </Text>
                </Pressable>

                {datePickerOpen && (
                  <View
                    onLayout={() =>
                      contentScrollRef.current?.scrollToEnd({ animated: true })
                    }
                    className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                  >
                    {Platform.OS === "ios" && (
                      <DateTimePicker
                        value={draftScheduleDate}
                        mode="date"
                        display="inline"
                        onValueChange={(_event, selectedDate) =>
                          setDraftScheduleDate(selectedDate)
                        }
                        accentColor="#18181b"
                        themeVariant="light"
                        style={{ height: 340, width: "100%" }}
                      />
                    )}

                    <View className="mt-2 flex-row items-center justify-between border-t border-zinc-200 pt-3">
                      <Text className="text-sm font-medium text-zinc-600">
                        {draftScheduleDate.toLocaleDateString()}
                      </Text>

                      <View className="flex-row gap-2">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Cancel date selection"
                          disabled={isBusy}
                          onPress={() => setDatePickerOpen(false)}
                          className="rounded-lg px-3 py-2 active:bg-zinc-200"
                        >
                          <Text className="text-sm font-medium text-zinc-600">
                            Cancel
                          </Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Apply selected date"
                          disabled={isBusy}
                          onPress={applyPickedDate}
                          className={`rounded-lg bg-zinc-950 px-3 py-2 active:bg-zinc-700 ${
                            isBusy ? "opacity-40" : ""
                          }`}
                        >
                          <Text className="text-sm font-semibold text-white">
                            {scheduleSaving ? "Saving..." : "Apply"}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          ) : (
            <Text className="text-zinc-500">Task not found</Text>
          )}
        </View>
      </TouchableWithoutFeedback>
    </>
  );
}
