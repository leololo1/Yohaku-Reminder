# Yohaku Reminder Screen Rules

## Reminder List Screen

The main screen should show:

- quiet app title
- open reminders grouped by date
- completed reminders with reduced emphasis
- floating add button

The screen should not show:

- motivational text
- task counters
- productivity scores
- streaks
- colorful priority labels
- category summaries
- analytics
- progress
- unnecessary headings

### Header

Keep the header small and quiet.

Do not use large headings like:

```text
Tasks
Productivity
Inbox
```

### Reminder List

Use the reminder row component rules from `components.md`.

Open reminders should feel present but not urgent.

Completed reminders should remain visible only as quiet history.

---

## Add Reminder Screen

The add screen should feel like writing on blank paper.

Required fields:

- Title
- Date
- Time

Optional fields:

- Notification
- Memo

Avoid complex forms.
Do not show too many controls at once.
Place save and close actions quietly at the top.
Avoid large primary buttons.

---

## Edit Reminder Screen

Use the same visual rules as the add reminder screen.

Show delete quietly at the bottom only when editing an existing reminder.

Do not place destructive actions near the save action.

---

## Notification Sheet

The notification sheet should appear from the bottom or fade in softly.

Rows should be text-led.

Do not use badges, colors, or notification illustrations.

---

## Completed State

Completing a reminder should be calm.

Allowed:

- soft opacity change
- quiet check mark
- reduced text emphasis

Avoid:

- green success color
- confetti
- progress animation
- celebratory copy
