# Spec: Daily progress on a task

**Status:** proposed
**Author:** Sheryar Ahmed
**Size:** ~2 to 3 days
**Migration:** 096

---

## 1. The problem

A mentee gets a task with a four day deadline. Today, the only two states anybody
can see are "assigned" and "submitted". Everything in between is invisible.

That hurts three people:

- **The mentee** has nowhere to record what they tried, so when they come back on
  day three they have lost the thread of their own thinking.
- **The mentor** cannot tell the difference between somebody who worked for three
  days and got stuck, and somebody who has not opened the task at all. Both look
  identical until the deadline passes.
- **Both of them** waste the first ten minutes of every one to one reconstructing
  what happened.

The signal we actually want is not "did they finish". It is **"is this going
badly, and can we tell before the deadline"**.

---

## 2. What already exists (read this before building)

Pathment already has a daily log. `DailyLogEntry` is one row per mentee per day:

```js
menteeId, dateKey: 'YYYY-MM-DD', tasksDone: UUID[], slotsDone: string[], note: TEXT
```

It already links to assigned tasks through `tasksDone`, mentees already fill it
in from `/mentee/daily-log`, and mentors already see it as "Recent daily logs" on
the mentee detail page.

**So this feature is not "add daily logging". It is "the log exists at the wrong
grain and in the wrong place".** Two concrete gaps:

1. **The note is per day, not per task.** Work on two tasks on Tuesday and one
   note covers both. A mentor reading "stuck on the refresh flow, fixed the
   pipeline" cannot tell which task that belongs to.
2. **It is invisible from the task.** Open a task as a mentee: nowhere to write.
   Open it as a mentor: no history. The data exists on a screen neither person is
   on while thinking about the task.

---

## 3. Decision: a child table, not a wider daily log

My first instinct was to add `assignedTaskId` to `daily_log_entries` and be done.
After reading the code, that is the wrong call. Three reasons:

**a) The `tasksDone` array would become a second source of truth.** If a task can
appear both in `tasksDone` and as its own row, the two can disagree. That is the
exact bug class we keep finding in this codebase (an application's `status`
column disagreeing with its real placement, a picker hiding people who existed).
Do not build another one.

**b) The unique constraint is load bearing.** `dailyLogService.upsert` relies on
`UNIQUE (mentee_id, date_key)` to mean "one row per day". Widening the key means
partial unique indexes to keep the day level note singular, which is fiddly and
easy to get subtly wrong.

**c) The mobile app mirrors this.** `server/src/services/streak.js` says its
counting is duplicated on the phone, and `pathment-mobile/src/features/daily-log`
reads and writes these rows. Changing the shape of `daily_log_entries` is a
breaking change across a repo we cannot deploy atomically with this one.

**The good news:** `currentStreak` and `longestStreak` both do
`new Set(dateKeys)`, so duplicate dates are already deduped. That means a second
table can feed the streak without touching the counting at all.

### The model

```js
// server/src/models/tasks/TaskProgressEntry.js
TaskProgressEntry {
  id:             UUID
  assignedTaskId: UUID   // FK assigned_tasks, CASCADE
  menteeId:       UUID   // FK users, CASCADE. Denormalised for cheap queries.
  dateKey:        STRING(10)   // 'YYYY-MM-DD' in the MENTEE's timezone
  note:           TEXT   // what they did, required, 1..2000 chars
  minutesSpent:   INTEGER | null   // optional, see §8
  createdAt, updatedAt
}
// UNIQUE (assigned_task_id, date_key)   one entry per task per day
// INDEX  (mentee_id, date_key)          the mentor's "did they show up" query
```

`dateKey` is a calendar day in the mentee's own timezone, resolved server side
with the existing `todayInZone` helper. Never trust a date from the client and
never use UTC here: a mentee in Karachi logging at 2am must get the right day.

---

## 4. How it connects to the streak

**Writing task progress counts as showing up that day.**

```
POST /mentee/tasks/:id/progress
  → create or update the TaskProgressEntry for (task, today)
  → upsert the DailyLogEntry for (mentee, today) so the day is logged
  → gamificationService.updateStreak(menteeId)      // already idempotent
```

This is the part that earns the feature its keep. Right now logging is a chore on
a separate page that many mentees skip. Moving it to the task means it happens
where the work happens, and the streak gets more honest as a side effect.

`tasksDone` on the daily log keeps its current meaning: **tasks ticked complete
that day**. A progress entry means **worked on it**. Those are different facts and
should stay different. Writing progress does NOT add the task to `tasksDone`.

---

## 5. API

All routes sit under the existing mentee and mentor guards. No new permission is
needed: seeing a mentee's task progress is covered by `mentee.view`, which every
mentor of that clan already holds.

| Method | Route | Who | Does |
| --- | --- | --- | --- |
| `POST` | `/mentee/tasks/:id/progress` | mentee (owner) | Create or update today's entry. Body `{ note, minutesSpent? }`. |
| `GET` | `/mentee/tasks/:id/progress` | mentee (owner) | Their own timeline for this task. |
| `DELETE` | `/mentee/tasks/:id/progress/:dateKey` | mentee (owner) | Remove one entry, within the edit window. |
| `GET` | `/mentor/tasks/:id/progress` | mentor of that clan | The same timeline, read only. |

**Authorization**, and this is the part to get right:

- The mentee routes must check the assigned task actually belongs to the caller.
  `AssignedTask.menteeId === req.user.id`. Not "is a mentee", which would let any
  mentee write on any task.
- The mentor route goes through `authzService.canViewMentee(user, menteeId)`, the
  same check the rest of the mentor surface uses. Do not hand roll a clan check.

**Edit window.** An entry is editable for **48 hours** after its `dateKey`, then
frozen. Rationale in §8.

---

## 6. UI

### Mentee, on the task detail page

A card between the description and the submit box. Only for tasks in
`assigned`, `in_progress` or `revision_needed`.

```
┌─────────────────────────────────────────────┐
│ Progress                        Day 3 of 4  │
│                                             │
│ ● Mon 24   Read the JWT docs and sketched   │
│            the refresh flow. Not written    │
│            any code yet.                    │
│ ● Tue 25   Got login working. Refresh is    │
│            still confusing me.              │
│ ○ Wed 26   ← today, empty                   │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ What did you do today?                  │ │
│ └─────────────────────────────────────────┘ │
│                            [ Save ]         │
└─────────────────────────────────────────────┘
```

- Placeholder is the prompt: **"What did you do today?"** Not "Add a note", which
  gets you "worked on it" forty times.
- Days with no entry render as a hollow marker, so a gap is visible rather than
  collapsed away. **The gaps are the signal.** Do not hide them.
- Saving shows the streak toast that the daily log already shows, so the reward
  is immediate and familiar.

### Mentor, two places

**On the task, when reviewing a submission.** The same timeline, read only, above
the submission. Context before judgement: a mentee who worked four days and
produced something rough deserves a different review from one who started at
11pm the night it was due.

**On the cohort review screen.** One line per mentee, no new screen:

> `Auth task · logged 3 of 4 days · last: "Refresh is still confusing me"`

This is where it earns its place. The mentor is already there, already going
person by person, and this turns a status into a conversation opener.

---

## 7. Notifications: none

**Do not notify a mentor when a mentee logs progress.** A mentor with 20 mentees
would get 60 notifications a week, mute the category, and stop seeing the
notifications that matter. We have already seen this shape of mistake in the
notification matrix.

Make it **pull, not push**: visible on the task, visible in review, summarised as
a count. The only thing that should ever push is the *absence* of progress, and
we already have machinery for that in the at risk and stall detection. If we want
that later, the rule is "task due in under 24h, zero progress entries, never
started", and it should be one notification, not a stream.

---

## 8. Decisions and their reasons

| Decision | Chosen | Why |
| --- | --- | --- |
| Mentor sees it daily or only at submit? | **Daily** | The whole point is catching a stall before the deadline. At submit the signal arrives after it is useful. |
| Is progress required? | **Optional** | Required logging produces "did stuff" forty times, which is worse than silence because it looks like data. |
| Editable how long? | **48 hours** | Long enough to fix a typo or backfill yesterday. Short enough that it stays a log rather than a document a mentee tidies up before review. |
| Can the mentor comment on an entry? | **No** | That is what task feedback and messaging are for. A third comment surface fragments the conversation. |
| Track time spent? | **Optional field, off by default** | Mentees either guess or resent it, and a wrong number is worse than none. Ship the column, hide the input, revisit if anyone asks. |
| One entry per day per task? | **Yes, upsert** | Multiple entries a day turns a timeline into a chat log and makes "logged 3 of 4 days" meaningless. |
| Does progress count toward the streak? | **Yes** | It is the same act (showed up, said what you did) in a better place. |

---

## 9. Out of scope for v1

Stated so they do not creep in:

- Mentor replies on individual entries
- File or image attachments on an entry
- Progress on quiz and interview tasks (they are single sitting, there is no "day 3")
- Progress percentage sliders (self reported percentages are fiction)
- Editing history or an audit trail on entries
- Mobile app support (the API is additive, so the phone can adopt it later)

---

## 10. Build order

1. **Migration 096** creating `task_progress_entries` with both indexes. Idempotent, following the `columnExists` pattern in the existing migrations.
2. **Model** `TaskProgressEntry` in `server/src/models/tasks/`, auto-discovered by the loader.
3. **`taskProgressService`** with `log`, `listForTask`, `remove`, and the daily log plus streak integration. Business logic here, not in the controller.
4. **Controller and routes**, thin, with the ownership check on the mentee side and `canViewMentee` on the mentor side.
5. **Tests** in `server/tests/mentee/task-progress.test.js`, covering: upsert on the same day replaces rather than duplicates, streak increments, a mentee cannot write to somebody else's task, a mentor outside the clan gets 403, the 48 hour edit window.
6. **Mentee UI** on the task detail page.
7. **Mentor UI**: the timeline on review, the one line summary on cohort review.
8. **Seeder**: add 2 to 4 progress entries per in flight task so the demo shows it.

Steps 1 to 5 are the feature. 6 to 8 are the part people see.

---

## 11. How we know it worked

Not "did we ship it". Three things worth measuring after two weeks:

- **Adoption:** share of in flight tasks with at least one progress entry. Under
  20 percent means the prompt or the placement is wrong, not that mentees are lazy.
- **Does it change the review?** Ask three mentors whether it changed a single
  conversation. If none of them noticed, the mentor surfacing is in the wrong place.
- **Did daily log usage rise?** If task progress goes up and daily log goes down by
  the same amount, we moved the chore rather than removing it. That is still a win,
  but it is a different win and we should say so honestly.
