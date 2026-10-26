# Task Manager

A mobile task manager for capturing tasks quickly, separating what matters now
from what can wait, and making the next step easier to choose. It supports
flexible planning without requiring every task to have a precise date from the
start.

> **Status: Work in progress.** The core task workflow is usable, while several
> prioritization and focus features are still being designed and built.

## Why this app

Long task lists often mix immediate work, future plans, and ideas in one place.
This project uses a small set of planning horizons so tasks can be captured
first and organized with as much—or as little—detail as needed.

- **Inbox** is a low-friction place to write something down without deciding
  when to do it. Tasks can be organized later.
- **Today / Scheduled / Soon / Someday** separate immediate priorities from
  upcoming work and ideas that can wait. `Scheduled` contains tasks with a
  specific future date; `Soon` and `Someday` intentionally do not require one.
- **Earlier** keeps tasks planned for previous dates visible so they can be
  reconsidered or rescheduled instead of disappearing from view. A planned
  date describes intent, not failure.
- **Schedule and Deadline are separate concepts.** Schedule answers “When do I
  intend to work on this?” A deadline answers “When must this be completed?”
  Both can be edited independently, so changing a plan does not change the
  actual constraint.

## Current features

- Navigate between the task list, decision tools, and a placeholder for future
  settings.
- Quickly create a task and place it in Inbox, Today, Tomorrow, Soon, or
  Someday.
- Group tasks into collapsible planning sections: Earlier, Today, Scheduled,
  Soon, Someday, Inbox, and Completed.
- Edit titles directly in the list, or open task details to edit the title,
  description, and schedule.
- Assign Today, Tomorrow, or any calendar date with local-date handling.
- Add, edit, or clear an optional deadline without changing the task schedule;
  a subtle warning highlights plans scheduled after their deadline.
- Drag tasks between Today, Soon, Someday, and Inbox. Moving a completed task
  back into an active group reopens it.
- Complete or reopen tasks from the list or task details, delete them with an
  Undo option, and keep all data locally in SQLite.
- Use Task Roulette to pick one unfinished task from selected planning groups,
  spin again for another suggestion, and open the selected task directly.

## Planned features

- **Task Duel** — compare two tasks at a time instead of evaluating the entire
  list at once.
- **Focus Mode** — provide a simpler workspace for one task with fewer
  distractions.

## Tech stack

- React Native and Expo
- Expo Router
- TypeScript
- NativeWind
- Expo SQLite
- React Native Gesture Handler and Reanimated

## Getting started

You will need Node.js and npm, plus [Expo Go](https://expo.dev/go) on a physical
iOS or Android device.

```bash
npm install
npx expo start
```

Scan the QR code shown by Expo CLI. On iPhone, use the Camera app; on Android,
use the scanner in Expo Go. The computer and phone should normally be on the
same network. A physical iPhone also requires Expo CLI and Expo Go to be signed
in to the same Expo account.

If the device cannot reach the local development server, try:

```bash
npx expo start --tunnel
```

To run the project checks:

```bash
npm run lint
npx tsc --noEmit
```
