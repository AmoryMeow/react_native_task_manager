import type { TaskGroupId } from "@/entities/task/lib/group-tasks";

import {
  DROP_TARGET_GROUP_IDS,
  getDestinationSchedule,
  getTaskGroupIndex,
  getTaskMoveActionTarget,
  getTaskMoveActions,
  getTaskMovedAnnouncement,
  isDropTargetGroup,
  TASK_GROUP_IDS,
} from "../task-drag";

describe("getTaskMoveActions", () => {
  test("offers every drop target except the current group", () => {
    expect(getTaskMoveActions("today")).toEqual([
      { name: "move-to-soon", label: "Move to Soon" },
      { name: "move-to-someday", label: "Move to Someday" },
      { name: "move-to-inbox", label: "Move to Inbox" },
    ]);
  });

  test.each<TaskGroupId>(["earlier", "upcoming", "completed"])(
    "offers all four drop targets for a task in %s",
    (groupId) => {
      expect(getTaskMoveActions(groupId).map((action) => action.label)).toEqual(
        ["Move to Today", "Move to Soon", "Move to Someday", "Move to Inbox"],
      );
    },
  );

  test("never offers the date-based Earlier or Scheduled groups as targets", () => {
    for (const groupId of TASK_GROUP_IDS) {
      const targets = getTaskMoveActions(groupId).map((action) =>
        getTaskMoveActionTarget(action.name),
      );

      expect(targets).not.toContain("earlier");
      expect(targets).not.toContain("upcoming");
      expect(targets).not.toContain("completed");
    }
  });

  test("matches the groups drag-and-drop accepts", () => {
    for (const groupId of TASK_GROUP_IDS) {
      for (const action of getTaskMoveActions(groupId)) {
        const target = getTaskMoveActionTarget(action.name);

        expect(target).not.toBeNull();
        expect(isDropTargetGroup(target!)).toBe(true);
        expect(TASK_GROUP_IDS[getTaskGroupIndex(target!)]).toBe(target);
      }
    }
  });
});

describe("getTaskMoveActionTarget", () => {
  test("ignores unrelated or invalid action names", () => {
    expect(getTaskMoveActionTarget("activate")).toBeNull();
    expect(getTaskMoveActionTarget("move-to-earlier")).toBeNull();
    expect(getTaskMoveActionTarget("move-to-upcoming")).toBeNull();
    expect(getTaskMoveActionTarget("move-to-completed")).toBeNull();
    expect(getTaskMoveActionTarget("move-to-")).toBeNull();
  });
});

describe("getDestinationSchedule", () => {
  test("maps each drop target to the existing schedule semantics", () => {
    const now = new Date(2026, 9, 31, 23, 30);

    expect(getDestinationSchedule("today", now)).toEqual({
      type: "date",
      date: "2026-10-31",
    });
    expect(getDestinationSchedule("soon", now)).toEqual({ type: "soon" });
    expect(getDestinationSchedule("someday", now)).toEqual({
      type: "someday",
    });
    expect(getDestinationSchedule("inbox", now)).toEqual({ type: "inbox" });
  });

  test("returns no schedule for date-based or completed groups", () => {
    expect(getDestinationSchedule("earlier")).toBeNull();
    expect(getDestinationSchedule("upcoming")).toBeNull();
    expect(getDestinationSchedule("completed")).toBeNull();
  });

  test("every move action resolves to a schedule", () => {
    for (const groupId of DROP_TARGET_GROUP_IDS) {
      expect(getDestinationSchedule(groupId)).not.toBeNull();
      expect(getTaskMovedAnnouncement(groupId)).toMatch(/^Moved to /);
    }
  });
});
