import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import {
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState, type ReactElement } from "react";
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

import {
  formatTaskSchedule,
  toLocalDateString,
} from "../../entities/task/lib/format-task-schedule";
import type { Task, TaskSchedule } from "../../entities/task/model/types";
import { createTaskRepository } from "../../entities/task/repository/task-repository";
import { CalendarDatePicker } from "../../shared/ui/date-picker/calendar-date-picker";
import { CalendarIcon } from "../../shared/ui/icons/calendar-icon";
import { ChevronIcon } from "../../shared/ui/icons/chevron-icon";

type ScheduleOption = "inbox" | "today" | "tomorrow" | "soon" | "someday";
type DatePickerTarget = "schedule" | "deadline";

const scheduleOptions: { label: string; value: ScheduleOption }[] = [
  { label: "Inbox", value: "inbox" },
  { label: "Today", value: "today" },
  { label: "Tomorrow", value: "tomorrow" },
  { label: "Soon", value: "soon" },
  { label: "Someday", value: "someday" },
];

const DEFAULT_SHEET_DETENTS = [0.5, 0.9];
const EXPANDED_SHEET_DETENTS = [0.9];

function DismissKeyboardOnPress({ children }: { children: ReactElement }) {
  if (Platform.OS === "web") return children;

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {children}
    </TouchableWithoutFeedback>
  );
}

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

function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: Date | string): string {
  const date = typeof value === "string" ? parseLocalDate(value) : value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatScheduleValue(schedule: TaskSchedule): string {
  return schedule.type === "date"
    ? formatDate(schedule.date)
    : formatTaskSchedule(schedule);
}

function schedulesMatch(left: TaskSchedule, right: TaskSchedule): boolean {
  if (left.type !== right.type) return false;

  return (
    left.type !== "date" || (right.type === "date" && left.date === right.date)
  );
}

function isScheduledAfterDeadline(task: Task): boolean {
  if (task.status === "done" || task.schedule.type !== "date" || !task.dueAt) {
    return false;
  }

  return (
    parseLocalDate(task.schedule.date).getTime() >
    parseLocalDate(task.dueAt).getTime()
  );
}

interface InlineDatePickerProps {
  accessibilityLabel: string;
  draftDate: Date;
  isSaving: boolean;
  onApply: () => void;
  onCancel: () => void;
  onChange: (date: Date) => void;
  onClear?: () => void;
}

function InlineDatePicker({
  accessibilityLabel,
  draftDate,
  isSaving,
  onApply,
  onCancel,
  onChange,
  onClear,
}: InlineDatePickerProps) {
  return (
    <View className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
      <CalendarDatePicker
        accessibilityLabel={accessibilityLabel}
        disabled={isSaving}
        onChange={onChange}
        value={draftDate}
      />

      <View className="border-t border-zinc-200 pt-2.5">
        <Text className="text-sm font-medium text-zinc-600">
          {formatDate(draftDate)}
        </Text>

        <View className="mt-1 flex-row items-center justify-end gap-1">
          {onClear && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear deadline"
              disabled={isSaving}
              onPress={onClear}
              className="rounded-lg px-3 py-2 active:bg-zinc-200"
            >
              <Text className="text-sm font-medium text-zinc-500">Clear</Text>
            </Pressable>
          )}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel date selection"
            disabled={isSaving}
            onPress={onCancel}
            className="rounded-lg px-3 py-2 active:bg-zinc-200"
          >
            <Text className="text-sm font-medium text-zinc-600">Cancel</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apply selected date"
            disabled={isSaving}
            onPress={onApply}
            className={`rounded-lg bg-zinc-950 px-3 py-2 active:bg-zinc-700 ${
              isSaving ? "opacity-40" : ""
            }`}
          >
            <Text className="text-sm font-semibold text-white">
              {isSaving ? "Saving..." : "Apply"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function TaskDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const navigation = useNavigation();

  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedTextChanges, setHasUnsavedTextChanges] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [descriptionSaving, setDescriptionSaving] = useState(false);
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
  const [descriptionSaveError, setDescriptionSaveError] = useState<
    string | null
  >(null);
  const [completionSaving, setCompletionSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [deadlineSaving, setDeadlineSaving] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [activeDatePicker, setActiveDatePicker] =
    useState<DatePickerTarget | null>(null);
  const [draftDate, setDraftDate] = useState(() => new Date());
  const [focusedField, setFocusedField] = useState<
    "title" | "description" | null
  >(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const titleSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const descriptionSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const completionSavePromiseRef = useRef<Promise<Task> | null>(null);
  const scheduleSavePromiseRef = useRef<Promise<Task> | null>(null);
  const deadlineSavePromiseRef = useRef<Promise<Task> | null>(null);
  const closePromiseRef = useRef<Promise<void> | null>(null);
  const allowRemovalRef = useRef(false);
  const isMountedRef = useRef(true);
  const titleDraftRef = useRef("");
  const descriptionDraftRef = useRef("");
  const savedTitleRef = useRef("");
  const savedDescriptionRef = useRef("");

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
          setHasUnsavedTextChanges(false);
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

  function updateUnsavedTextState() {
    if (!isMountedRef.current) return;

    setHasUnsavedTextChanges(
      titleDraftRef.current.trim() !== savedTitleRef.current ||
        descriptionDraftRef.current !== savedDescriptionRef.current,
    );
  }

  function saveTitle(): Promise<boolean> {
    if (titleSavePromiseRef.current) {
      return titleSavePromiseRef.current;
    }

    if (!task || !titleDraftRef.current.trim()) {
      return Promise.resolve(false);
    }

    if (isMountedRef.current) {
      setTitleSaving(true);
    }

    const savePromise = (async () => {
      let followedFailedSave = false;

      while (true) {
        const titleToSave = titleDraftRef.current.trim();

        if (!titleToSave) return false;

        if (titleToSave === savedTitleRef.current) {
          titleDraftRef.current = titleToSave;
          if (isMountedRef.current) {
            setTitle(titleToSave);
            setTitleSaveError(null);
          }
          updateUnsavedTextState();
          return true;
        }

        try {
          const updatedTask = await createTaskRepository(db).updateTaskTitle(
            task,
            titleToSave,
          );

          savedTitleRef.current = updatedTask.title;
          if (isMountedRef.current) {
            setTask((current) =>
              current
                ? {
                    ...current,
                    title: updatedTask.title,
                    updatedAt: updatedTask.updatedAt,
                  }
                : current,
            );
          }

          if (titleDraftRef.current.trim() === updatedTask.title) {
            titleDraftRef.current = updatedTask.title;
            if (isMountedRef.current) {
              setTitle(updatedTask.title);
              setTitleSaveError(null);
            }
            updateUnsavedTextState();
            return true;
          }
        } catch (error) {
          console.error("Failed to save task title", error);
          if (isMountedRef.current) {
            setTitleSaveError("Title wasn't saved.");
          }

          if (
            followedFailedSave ||
            titleDraftRef.current.trim() === titleToSave
          ) {
            return false;
          }

          followedFailedSave = true;
        }
      }
    })().finally(() => {
      titleSavePromiseRef.current = null;
      if (isMountedRef.current) {
        setTitleSaving(false);
      }
    });

    titleSavePromiseRef.current = savePromise;
    return savePromise;
  }

  function saveDescription(): Promise<boolean> {
    if (descriptionSavePromiseRef.current) {
      return descriptionSavePromiseRef.current;
    }

    if (!task) return Promise.resolve(false);

    if (isMountedRef.current) {
      setDescriptionSaving(true);
    }

    const savePromise = (async () => {
      let followedFailedSave = false;

      while (true) {
        const descriptionToSave = descriptionDraftRef.current;

        if (descriptionToSave === savedDescriptionRef.current) {
          if (isMountedRef.current) {
            setDescriptionSaveError(null);
          }
          updateUnsavedTextState();
          return true;
        }

        try {
          await createTaskRepository(db).updateTaskDescription(
            task.id,
            descriptionToSave,
          );

          savedDescriptionRef.current = descriptionToSave;
          if (isMountedRef.current) {
            setTask((current) =>
              current
                ? { ...current, description: descriptionToSave }
                : current,
            );
          }

          if (descriptionDraftRef.current === descriptionToSave) {
            if (isMountedRef.current) {
              setDescriptionSaveError(null);
            }
            updateUnsavedTextState();
            return true;
          }
        } catch (error) {
          console.error("Failed to save task description", error);
          if (isMountedRef.current) {
            setDescriptionSaveError("Description wasn't saved.");
          }

          if (
            followedFailedSave ||
            descriptionDraftRef.current === descriptionToSave
          ) {
            return false;
          }

          followedFailedSave = true;
        }
      }
    })().finally(() => {
      descriptionSavePromiseRef.current = null;
      if (isMountedRef.current) {
        setDescriptionSaving(false);
      }
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

  async function saveAndDismiss(dismiss: () => void) {
    if (closePromiseRef.current) return closePromiseRef.current;

    if (!titleDraftRef.current.trim()) {
      Alert.alert("Title required", "Task title cannot be empty.");
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    const closePromise = (async () => {
      const pendingWrites = [
        completionSavePromiseRef.current,
        scheduleSavePromiseRef.current,
        deadlineSavePromiseRef.current,
      ].filter((promise): promise is Promise<Task> => promise !== null);
      const pendingResults = await Promise.allSettled(pendingWrites);

      if (pendingResults.some((result) => result.status === "rejected")) {
        return;
      }

      const saved = await saveChanges();

      if (!saved) {
        return;
      }

      if (!isMountedRef.current) return;

      allowRemovalRef.current = true;
      dismiss();
    })().finally(() => {
      closePromiseRef.current = null;
      if (isMountedRef.current) {
        setSaving(false);
      }
    });

    closePromiseRef.current = closePromise;
    return closePromise;
  }

  function handleDone() {
    void saveAndDismiss(() => {
      if (navigation.canGoBack()) {
        router.back();
      } else {
        router.replace("/");
      }
    });
  }

  function handleStartFocus() {
    if (!task || task.status === "done" || isBusy) return;

    const taskId = task.id;

    void saveAndDismiss(() => {
      router.replace({
        pathname: "/focus/[id]",
        params: { id: taskId },
      });
    });
  }

  function toggleCompletion() {
    if (!task || isBusy || completionSavePromiseRef.current) return;

    setCompletionSaving(true);

    const savePromise = createTaskRepository(db).toggleTask(task);
    completionSavePromiseRef.current = savePromise;

    void savePromise
      .then((updatedTask) => {
        if (!isMountedRef.current) return;

        setTask((current) =>
          current
            ? {
                ...current,
                status: updatedTask.status,
                completedAt: updatedTask.completedAt,
                updatedAt: updatedTask.updatedAt,
              }
            : current,
        );
      })
      .catch((error) => {
        console.error("Failed to update task completion", error);
        if (!isMountedRef.current) return;

        Alert.alert(
          "Couldn't update task",
          "The completion status wasn't changed. Please try again.",
        );
      })
      .finally(() => {
        completionSavePromiseRef.current = null;
        if (isMountedRef.current) {
          setCompletionSaving(false);
        }
      });
  }

  function collapseScheduleControls() {
    if (!isMountedRef.current) return;

    setScheduleExpanded(false);
    setActiveDatePicker((current) => (current === "schedule" ? null : current));
  }

  function saveSchedule(nextSchedule: TaskSchedule) {
    if (!task || isBusy || scheduleSavePromiseRef.current) return;

    if (schedulesMatch(task.schedule, nextSchedule)) {
      collapseScheduleControls();
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
        if (!isMountedRef.current) return;

        setTask((current) =>
          current
            ? {
                ...current,
                schedule: updatedTask.schedule,
                updatedAt: updatedTask.updatedAt,
              }
            : current,
        );

        collapseScheduleControls();
      })
      .catch((error) => {
        console.error("Failed to update task schedule", error);
        if (!isMountedRef.current) return;

        Alert.alert(
          "Couldn't update schedule",
          "The schedule wasn't changed. Please try again.",
        );
      })
      .finally(() => {
        scheduleSavePromiseRef.current = null;
        if (isMountedRef.current) {
          setScheduleSaving(false);
        }
      });
  }

  function saveDeadline(dueAt: string | null) {
    if (!task || isBusy || deadlineSavePromiseRef.current) return;

    if ((task.dueAt ?? null) === dueAt) {
      setActiveDatePicker(null);
      return;
    }

    setDeadlineSaving(true);

    const savePromise = createTaskRepository(db).updateTaskDeadline(
      task.id,
      dueAt,
    );

    deadlineSavePromiseRef.current = savePromise;

    void savePromise
      .then((updatedTask) => {
        if (!isMountedRef.current) return;

        setTask((current) =>
          current
            ? {
                ...current,
                dueAt: updatedTask.dueAt,
                updatedAt: updatedTask.updatedAt,
              }
            : current,
        );
        setActiveDatePicker(null);
      })
      .catch((error) => {
        console.error("Failed to update task deadline", error);
        if (!isMountedRef.current) return;

        Alert.alert(
          "Couldn't update deadline",
          "The deadline wasn't changed. Please try again.",
        );
      })
      .finally(() => {
        deadlineSavePromiseRef.current = null;
        if (isMountedRef.current) {
          setDeadlineSaving(false);
        }
      });
  }

  function updateDraftDate(date: Date) {
    if (!isMountedRef.current) return;

    setDraftDate(date);
  }

  function openDatePicker(target: DatePickerTarget) {
    if (!task || isBusy || activeDatePicker === target) return;

    const initialDate =
      target === "schedule"
        ? task.schedule.type === "date"
          ? parseLocalDate(task.schedule.date)
          : new Date()
        : task.dueAt
          ? parseLocalDate(task.dueAt)
          : new Date();

    Keyboard.dismiss();
    setDraftDate(initialDate);
    setActiveDatePicker(target);

    if (target === "deadline") {
      setScheduleExpanded(false);
    }

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        display: "calendar",
        onValueChange: (_event, selectedDate) => {
          updateDraftDate(selectedDate);
        },
        onDismiss: () => {
          if (isMountedRef.current) {
            setActiveDatePicker(null);
          }
        },
      });
    }
  }

  function selectSchedule(option: ScheduleOption) {
    saveSchedule(toTaskSchedule(option));
  }

  function toggleDeadlinePicker() {
    if (activeDatePicker === "deadline") {
      setActiveDatePicker(null);
    } else {
      openDatePicker("deadline");
    }
  }

  function applyPickedDate() {
    const date = toLocalDateString(draftDate);

    if (activeDatePicker === "schedule") {
      saveSchedule({ type: "date", date });
    } else if (activeDatePicker === "deadline") {
      saveDeadline(date);
    }
  }

  const isBusy = saving || completionSaving || scheduleSaving || deadlineSaving;
  const shouldPreventDismiss =
    hasUnsavedTextChanges ||
    titleSaving ||
    descriptionSaving ||
    completionSaving ||
    scheduleSaving ||
    deadlineSaving ||
    saving;
  const showScheduleDeadlineWarning = task
    ? isScheduledAfterDeadline(task)
    : false;

  useEffect(() => {
    return navigation.addListener("beforeRemove", (event) => {
      if (allowRemovalRef.current || !shouldPreventDismiss) return;

      event.preventDefault();
      void saveAndDismiss(() => navigation.dispatch(event.data.action));
    });
  });

  return (
    <>
      <Stack.Screen
        options={{
          sheetAllowedDetents: activeDatePicker
            ? EXPANDED_SHEET_DETENTS
            : DEFAULT_SHEET_DETENTS,
          gestureEnabled: !shouldPreventDismiss,
        }}
      />

      <DismissKeyboardOnPress>
        <View className="flex-1 bg-white px-5 pt-6">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-lg font-semibold">Task details</Text>

            <Pressable
              onPress={handleDone}
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
                <View className="flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={
                      task.status === "done"
                        ? "Mark task as incomplete"
                        : "Mark task as completed"
                    }
                    accessibilityState={{
                      checked: task.status === "done",
                      disabled: isBusy,
                    }}
                    disabled={isBusy}
                    onPress={toggleCompletion}
                    className="h-12 w-10 items-center justify-center rounded-xl active:bg-zinc-100"
                  >
                    <View
                      className={
                        task.status === "done"
                          ? "h-5 w-5 items-center justify-center rounded-md bg-zinc-950"
                          : "h-5 w-5 rounded-md border-2 border-zinc-400"
                      }
                    >
                      {task.status === "done" && (
                        <Text className="text-xs font-bold text-white">✓</Text>
                      )}
                    </View>
                  </Pressable>

                  <TextInput
                    accessibilityLabel="Task title"
                    value={title}
                    onChangeText={(value) => {
                      titleDraftRef.current = value;
                      setTitle(value);
                      setHasUnsavedTextChanges(
                        value.trim() !== savedTitleRef.current ||
                          descriptionDraftRef.current !==
                            savedDescriptionRef.current,
                      );
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
                    className={`min-h-12 flex-1 rounded-xl border bg-zinc-50 px-3.5 py-2.5 text-lg font-semibold ${
                      task.status === "done"
                        ? "text-zinc-400 line-through"
                        : "text-zinc-950"
                    } ${
                      focusedField === "title"
                        ? "border-zinc-500"
                        : "border-zinc-200"
                    }`}
                  />
                </View>

                {titleSaveError && (
                  <View
                    accessibilityLiveRegion="polite"
                    className="ml-12 flex-row items-center justify-between gap-3 px-1"
                  >
                    <Text className="flex-1 text-xs text-red-600">
                      {titleSaveError}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry saving task title"
                      disabled={titleSaving || saving}
                      onPress={() => void saveTitle()}
                      className="rounded-md px-2 py-1 active:bg-zinc-100"
                    >
                      <Text className="text-xs font-semibold text-blue-600">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                )}
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
                    setHasUnsavedTextChanges(
                      titleDraftRef.current.trim() !== savedTitleRef.current ||
                        value !== savedDescriptionRef.current,
                    );
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

                {descriptionSaveError && (
                  <View
                    accessibilityLiveRegion="polite"
                    className="flex-row items-center justify-between gap-3 px-1"
                  >
                    <Text className="flex-1 text-xs text-red-600">
                      {descriptionSaveError}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retry saving task description"
                      disabled={descriptionSaving || saving}
                      onPress={() => void saveDescription()}
                      className="rounded-md px-2 py-1 active:bg-zinc-100"
                    >
                      <Text className="text-xs font-semibold text-blue-600">
                        Retry
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View className="gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Schedule, ${formatScheduleValue(task.schedule)}`}
                  accessibilityState={{
                    disabled: isBusy,
                    expanded: scheduleExpanded,
                  }}
                  disabled={isBusy}
                  onPress={() => {
                    Keyboard.dismiss();
                    setActiveDatePicker(null);
                    setScheduleExpanded((current) => !current);
                  }}
                  className={`h-12 flex-row items-center justify-between rounded-xl border px-3.5 ${
                    scheduleExpanded
                      ? "border-zinc-400 bg-zinc-50"
                      : "border-zinc-200 bg-white active:bg-zinc-50"
                  } ${isBusy ? "opacity-40" : ""}`}
                >
                  <View className="flex-row items-center gap-2.5">
                    <CalendarIcon />
                    <Text className="text-sm font-medium text-zinc-800">
                      Schedule
                    </Text>
                  </View>

                  <View className="ml-3 flex-row items-center gap-2">
                    <Text
                      numberOfLines={1}
                      className="flex-shrink text-sm text-zinc-500"
                    >
                      {formatScheduleValue(task.schedule)}
                    </Text>
                    <ChevronIcon direction={scheduleExpanded ? "up" : "down"} />
                  </View>
                </Pressable>

                {scheduleExpanded && (
                  <View className="gap-2 rounded-xl bg-zinc-50 p-2.5">
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
                            onPress={() => selectSchedule(option.value)}
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
                      accessibilityLabel="Choose a schedule date"
                      accessibilityState={{
                        disabled: isBusy,
                        expanded: activeDatePicker === "schedule",
                      }}
                      disabled={isBusy}
                      onPress={() => openDatePicker("schedule")}
                      className="h-10 flex-row items-center gap-2 rounded-lg px-2 active:bg-zinc-200"
                    >
                      <CalendarIcon size={15} />
                      <Text className="text-sm font-medium text-zinc-700">
                        Choose a date
                      </Text>
                    </Pressable>

                    {activeDatePicker === "schedule" && (
                      <View
                        onLayout={() =>
                          contentScrollRef.current?.scrollToEnd({
                            animated: true,
                          })
                        }
                      >
                        <InlineDatePicker
                          accessibilityLabel="Schedule date"
                          draftDate={draftDate}
                          isSaving={scheduleSaving}
                          onApply={applyPickedDate}
                          onCancel={() => setActiveDatePicker(null)}
                          onChange={updateDraftDate}
                        />
                      </View>
                    )}
                  </View>
                )}

                {task.dueAt ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Deadline, ${formatDate(task.dueAt)}`}
                    accessibilityState={{
                      disabled: isBusy,
                      expanded: activeDatePicker === "deadline",
                    }}
                    disabled={isBusy}
                    onPress={toggleDeadlinePicker}
                    className={`h-12 flex-row items-center justify-between rounded-xl border px-3.5 ${
                      activeDatePicker === "deadline"
                        ? "border-zinc-400 bg-zinc-50"
                        : "border-zinc-200 bg-white active:bg-zinc-50"
                    } ${isBusy ? "opacity-40" : ""}`}
                  >
                    <View className="flex-row items-center gap-2.5">
                      <CalendarIcon />
                      <Text className="text-sm font-medium text-zinc-800">
                        Deadline
                      </Text>
                    </View>

                    <View className="ml-3 flex-row items-center gap-2">
                      <Text className="text-sm text-zinc-500">
                        {formatDate(task.dueAt)}
                      </Text>
                      <ChevronIcon
                        direction={
                          activeDatePicker === "deadline" ? "up" : "down"
                        }
                      />
                    </View>
                  </Pressable>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add deadline"
                    accessibilityState={{
                      disabled: isBusy,
                      expanded: activeDatePicker === "deadline",
                    }}
                    disabled={isBusy}
                    onPress={toggleDeadlinePicker}
                    className={`h-10 self-start justify-center rounded-lg px-2.5 active:bg-zinc-100 ${
                      isBusy ? "opacity-40" : ""
                    }`}
                  >
                    <Text className="text-sm font-medium text-zinc-500">
                      + Add deadline
                    </Text>
                  </Pressable>
                )}

                {activeDatePicker === "deadline" && (
                  <View
                    onLayout={() =>
                      contentScrollRef.current?.scrollToEnd({ animated: true })
                    }
                  >
                    <InlineDatePicker
                      accessibilityLabel="Deadline date"
                      draftDate={draftDate}
                      isSaving={deadlineSaving}
                      onApply={applyPickedDate}
                      onCancel={() => setActiveDatePicker(null)}
                      onChange={updateDraftDate}
                      onClear={
                        task.dueAt ? () => saveDeadline(null) : undefined
                      }
                    />
                  </View>
                )}

                {showScheduleDeadlineWarning && (
                  <Text className="px-2 pt-0.5 text-xs font-medium text-amber-700">
                    Scheduled after deadline
                  </Text>
                )}
              </View>

              {task.status !== "done" && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Start focus"
                  accessibilityState={{ disabled: isBusy }}
                  disabled={isBusy}
                  onPress={handleStartFocus}
                  className={`min-h-12 items-center justify-center rounded-xl bg-zinc-950 px-4 active:bg-zinc-700 ${
                    isBusy ? "opacity-40" : ""
                  }`}
                >
                  <Text className="text-base font-semibold text-white">
                    Start focus
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          ) : (
            <Text className="text-zinc-500">Task not found</Text>
          )}
        </View>
      </DismissKeyboardOnPress>
    </>
  );
}
