# Task Manager

A mobile task manager for capturing tasks quickly, separating what matters now
from what can wait, and making the next step easier to choose. It supports
flexible planning without requiring every task to have a precise date from the
start.

> **Status: Work in progress.** The core task workflow is usable, while several
> prioritization and focus features are still being designed and built.

## Live Demo

[Try the interactive demo](https://react-native-task-manager.expo.app)

The web demo stores tasks locally in your browser. Data is not synchronized
between devices.

> Work in progress. Optimized for mobile screens.

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
- Use Task Duel to compare two unfinished tasks from selected planning groups
  and make one immediate choice without reviewing the entire list.
- Start Focus Mode from an unfinished task's details to work with its title and
  description without the surrounding task list, then complete it or return to
  Tasks without changing it.

## Tech stack

- React Native and Expo
- Expo Router
- TypeScript
- NativeWind
- Expo SQLite
- React Native Gesture Handler and Reanimated
- Jest and jest-expo
- Playwright
- Maestro

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

To run the browser version, use the project script so the Expo SDK 57 web
worker compatibility fix is applied before Metro starts:

```bash
npm run web
```

If the default port is already in use, choose another one explicitly:

```bash
npm run web -- --port 8082
```

To run the project checks:

```bash
npm run lint
npx tsc --noEmit
npm test -- --runInBand
```

The web end-to-end tests build a production export, serve it locally with Expo,
and run the critical task workflows in Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

To open the last HTML report:

```bash
npm run test:e2e:report
```

### Native end-to-end tests

Maestro smoke tests cover the native task flow on an iOS Simulator. Android is
prepared through the same EAS build profile, but it is not part of the workflow
yet.

For local testing, install Xcode with an iOS Simulator and the
[Maestro CLI](https://docs.maestro.dev/getting-started/installing-maestro). Build
and launch the native app, then run the flows:

```bash
npx expo run:ios
maestro test .maestro/launch-and-navigation.yml
maestro test .maestro/task-creation-and-persistence.yml
```

The cloud workflow is manual-only and builds a standalone iOS Simulator app
before running both flows:

```bash
npx eas-cli@latest workflow:run .eas/workflows/mobile-e2e.yml
```

Hosted Maestro jobs require a paid Expo plan. Cloud runs also consume EAS Build
and Workflow usage, so check the account's current quota under **Billing →
Usage** in the Expo dashboard before triggering one.

## CI/CD

GitHub Actions runs TypeScript validation, ESLint, unit tests, a production web
export, and Chromium end-to-end tests on every push and pull request. The same
checks run before every manual deployment. Failed E2E runs upload their HTML
report, screenshots, and traces as a workflow artifact.

Deployments are always manual. In GitHub, open **Actions → Deploy web → Run
workflow**, select the Git ref, and choose either `preview` or `production`.
Production deployments are accepted only from the `main` branch.

Before running a deployment, create an
[Expo access token](https://docs.expo.dev/accounts/programmatic-access/) and
save it as the `EXPO_TOKEN` repository secret under **Settings → Secrets and
variables → Actions**. Create `preview` and `production` GitHub Environments as
well; required reviewers and a `main`-only deployment branch rule are
recommended for the production environment.

The deployment URL is printed in the workflow log and is also available in the
project's EAS Hosting deployments. Commits and pull requests never trigger a
deployment automatically.

Native mobile E2E is also manual and runs separately on EAS Workflows. It does
not run on pushes, pull requests, or web deployments.
