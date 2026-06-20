# Yohaku Reminder Design Documents

This directory defines the design rules for Yohaku Reminder.

Yohaku Reminder is a quiet, minimal reminder app. It should feel like a white note left in a calm room, where only the reminders that matter are placed gently.

These documents are the source of truth for UI design decisions.

---

## Document Structure

### `philosophy.md`

Defines the core design philosophy.

Read this first before implementing any UI.

This file explains:
- what Yohaku Reminder is
- what kind of feeling the app should have
- how to decide whether a UI element should exist
- the relationship between reminder utility and visual restraint

---

### `tokens.md`

Defines visual tokens.

This file includes:
- colors
- typography
- spacing
- border radius
- shadows
- line styles

Use these values as much as possible when implementing UI.

---

### `components.md`

Defines reusable UI component rules.

This file includes:
- floating add button
- icon buttons
- reminder rows
- completion marks
- date and time fields
- notification choices
- forms
- detail rows

Use this file when building or modifying UI components.

---

### `screens.md`

Defines screen-level layout rules.

This file includes:
- reminder list screen
- add reminder screen
- edit reminder screen
- notification sheet
- quiet completed state

Use this file when implementing full screens.

---

### `motion.md`

Defines interaction and animation rules.

Motion must remain calm and subtle.

---

### `anti-patterns.md`

Defines what must not be added.

Yohaku Reminder must not become a colorful, urgent, productivity-heavy reminder app.

---

## Core Principle

The core design principle is:

> Remove anything that does not need to exist.

Yohaku Reminder should not feel like a dashboard, task manager, or habit tracker.

It should feel like:
- a blank page
- a small note
- a quiet room
- high-end stationery
- a calm place to leave future thoughts

---

## App Identity

App name:

```text
Yohaku Reminder
```
