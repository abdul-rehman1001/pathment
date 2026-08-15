#!/usr/bin/env bash
#
# Creates GitHub issues for the latest batch of Pathment work, talking to the
# GitHub REST API directly (no `gh` CLI needed) using a personal access token.
# Numbers continue after the previous set (FEAT-42 / ENH-43 / BUG-05).
#
#   • Auth: reads the token from $GH_TOKEN or $GITHUB_TOKEN (needs `repo` scope).
#   • Idempotent: skips any issue whose title already exists (open OR closed),
#     ignoring the "CODE-NN:" prefix so a re-numbered duplicate still matches.
#   • Every issue is assigned to Sheryar-Ahmed.
#
# Usage:
#   export GITHUB_TOKEN=ghp_xxx          # if not already exported
#   ./create-github-issues-2026-06.sh [--dry-run]
#
# Code series:  FEAT-xx features · ENH-xx enhancements · BUG-xx fixes · CHORE-xx maintenance

set -o pipefail

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

API="https://api.github.com"
ASSIGNEE="Sheryar-Ahmed"

TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "ERROR: No token found. Export one first, e.g.:" >&2
  echo "       export GITHUB_TOKEN=ghp_xxxxxxxx   (needs the 'repo' scope)" >&2
  exit 1
fi

# Resolve owner/repo from the git remote (falls back to pathment/pathment).
REMOTE="$(git config --get remote.origin.url 2>/dev/null || echo '')"
REPO="$(printf '%s' "$REMOTE" | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')"
[[ -z "$REPO" ]] && REPO="pathment/pathment"

auth_header="Authorization: token $TOKEN"

# Verify the token works before doing anything.
ME="$(curl -fsS -H "$auth_header" "$API/user" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("login",""))' 2>/dev/null || echo '')"
if [[ -z "$ME" ]]; then
  echo "ERROR: GitHub rejected the token. Check it's valid and has the 'repo' scope." >&2
  exit 1
fi
echo "Authenticated as: $ME   ·   repo: $REPO   ·   assignee: $ASSIGNEE   ·   dry-run: $DRY_RUN"
echo ""

# ── Existing titles (open + closed), normalized for duplicate detection ──────
norm() { printf '%s' "$1" | sed -E 's/^[A-Za-z]+-[0-9]+:[[:space:]]*//' | tr '[:upper:]' '[:lower:]' | sed -E 's/[[:space:]]+$//'; }

echo "Fetching existing issues to skip duplicates…"
EXISTING_NORM=""
page=1
while :; do
  resp="$(curl -fsS -H "$auth_header" "$API/repos/$REPO/issues?state=all&per_page=100&page=$page" 2>/dev/null || echo '[]')"
  count="$(printf '%s' "$resp" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo 0)"
  titles="$(printf '%s' "$resp" | python3 -c '
import sys, json, re
for it in json.load(sys.stdin):
    if it.get("pull_request"):
        continue
    print(re.sub(r"^[A-Za-z]+-\d+:\s*", "", it.get("title", "")).strip().lower())
' 2>/dev/null || echo '')"
  EXISTING_NORM+="$titles"$'\n'
  [[ "$count" -lt 100 ]] && break
  page=$((page + 1))
done
echo "  found $(printf '%s' "$EXISTING_NORM" | grep -c . || true) existing issues."
echo ""

# ── Helpers ──────────────────────────────────────────────────────────────────
ensure_label() {
  local name="$1" color="$2" desc="$3"
  $DRY_RUN && return 0
  local payload
  payload="$(python3 -c 'import json,sys;print(json.dumps({"name":sys.argv[1],"color":sys.argv[2],"description":sys.argv[3]}))' "$name" "$color" "$desc")"
  curl -fsS -o /dev/null -X POST -H "$auth_header" "$API/repos/$REPO/labels" -d "$payload" 2>/dev/null || true
}

create_issue() {
  local title="$1" body="$2" labels="$3"
  local key; key="$(norm "$title")"
  if printf '%s\n' "$EXISTING_NORM" | grep -qixF "$key"; then
    echo "skip (already exists): $title"
    return 0
  fi
  echo "create: $title"
  $DRY_RUN && return 0
  local payload
  payload="$(python3 -c '
import json, sys
title, body, labels, assignee = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
print(json.dumps({
    "title": title,
    "body": body,
    "labels": [l for l in labels.split(",") if l],
    "assignees": [assignee],
}))' "$title" "$body" "$labels" "$ASSIGNEE")"
  local num
  num="$(curl -fsS -X POST -H "$auth_header" "$API/repos/$REPO/issues" -d "$payload" 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin).get("number",""))' 2>/dev/null || echo '')"
  if [[ -n "$num" ]]; then
    echo "  ✓ created #$num (assigned to $ASSIGNEE)"
  else
    echo "  ✗ failed — token may lack 'repo' scope, or $ASSIGNEE can't be assigned"
  fi
}

# ── Labels (idempotent) ──────────────────────────────────────────────────────
ensure_label "enhancement" "a2eeef" "New feature or enhancement"
ensure_label "bug"         "d73a4a" "Something is not working"
ensure_label "chore"       "e4e669" "Maintenance / non-user-facing"
ensure_label "frontend"    "1d76db" "Client / UI"
ensure_label "backend"     "0e8a16" "Server / API"
ensure_label "mentor"      "5319e7" "Affects the mentor role"
ensure_label "mentee"      "006b75" "Affects the mentee role"
ensure_label "admin"       "0052cc" "Affects the admin role"
ensure_label "ux"          "fbca04" "User experience"
echo ""

# ════════════════════════════════════════════════════════════════════════════
#  Issues
# ════════════════════════════════════════════════════════════════════════════

create_issue \
  "BUG-06: Quiz auto-grading and mentor-review scores were inconsistent" \
  "## Summary
Quiz grading and the mentor's review disagreed and could show impossible numbers.

## Fixes
- **Multiple-choice now gives partial credit** instead of all-or-nothing: \`points x max(0, (right - wrong) / total)\`, so a mostly-right answer isn't a flat zero and \"select everything\" can't game it.
- **Mentor points input is clamped to the question max** — you could type 100 into a /2 field and see \`105/15 (700%)\`; the running total and Finalize button now can't exceed the real total.
- **Score is rounded** — no more \`33.33333333%\` in the review header.
- **One consistent percentage** — the review header, the Approvals list and the mentee's \"Your Submission\" line now all show the mentor's final adjusted score (it read 47% in one place, 33% in another). Finalizing rewrites the mentee-facing line to the final score.

## Key files
- \`server/src/services/quizSessionService.js\`, \`client-interface/components/mentor/QuizReviewDrawer.tsx\`" \
  "bug,frontend,backend,mentor,mentee"

create_issue \
  "BUG-07: Quiz tasks weren't reachable or re-attemptable from the task pages" \
  "## Summary
Several ways a quiz could be un-openable or a re-attempt un-findable.

## Fixes
- **Task Details opened the generic \"Submit Work\" flow** for a quiz instead of the quiz — it now shows Start / Resume / View-result and routes to the quiz runner.
- **\"Allow re-attempt\" had no entry point** — a completed / awaiting quiz now offers a way back into the runner, and the runner shows a **Retake quiz** button when re-attempts are allowed.
- **Quiz descriptions showed raw \`<p>\` HTML** on the feedback page and the quiz intro — now rendered as formatted text.

## Key files
- \`client-interface/app/mentee/tasks/[id]/page.tsx\`, \`app/mentee/tasks/page.tsx\`, \`app/mentee/quizzes/[taskId]/page.tsx\`, \`app/mentee/feedback/[id]/page.tsx\`" \
  "bug,frontend,mentee"

create_issue \
  "ENH-44: Assign Task drawer closes automatically after assigning" \
  "## Summary
After assigning a task the drawer used to swap to a \"Task assigned\" screen you had to dismiss. It now closes on its own once the assignment succeeds (single, bulk and roadmap paths).

## Key files
- \`client-interface/components/mentor/AssignTaskDrawer.tsx\`" \
  "enhancement,frontend,mentor,ux"

create_issue \
  "BUG-08: Email notification preferences didn't persist and the master switch didn't gate" \
  "## Summary
Disabling email notifications didn't stick, and turning them all off didn't stop the emails.

## Fixes
- **Toggles reverted on refresh** — \`GET /profile\` never returned the saved \`emailNotifications\`, so the settings page loaded empty (everything defaulted ON) and the next Save clobbered the saved values. The profile query now returns them.
- **Master switch didn't gate** — the per-event key was checked *before* the master \`enabled\` flag, so email-off didn't stop events whose per-event key was still true. Master-off is now an absolute off, checked first (mirrors the push logic).

## Key files
- \`server/src/controllers/profileController.js\`, \`server/src/utils/notificationPreferences.js\`" \
  "bug,backend,mentor,mentee,admin"

create_issue \
  "ENH-45: Every emailable notification is toggleable; removed a dead prefs path" \
  "## Summary
Some emailable events had no toggle (so you couldn't turn them off), and three settings hooks kept a dead notification path that saved to a field the email gate ignores.

## What's included
- Added the missing toggles — \`meeting_booked\`, \`cross_clan_assigned\`, \`new_mentee_in_clan\`, \`mentee_returned\`, \`promotion_nominated\`, \`mentee_reengage\`, \`feedback_status_updated\` — each scoped to the roles that actually receive it.
- Removed the legacy \`notificationSettings\` path from the mentee / mentor / admin settings hooks (it wrote to \`preferences.notifications\`, which the email gate never reads) and their index re-exports + page destructures.

## Key files
- \`client-interface/lib/config/notificationCategories.ts\`, \`lib/hooks/{mentee,mentor,admin}/useXSettings.ts\` (+ index), \`app/{mentee,mentor}/settings/page.tsx\`" \
  "enhancement,frontend,backend,mentor,mentee,admin"

create_issue \
  "BUG-09: Interview runner lost answers and misattributed recordings" \
  "## Summary
A live interview could lose typed answers, garble a voice transcript, and attach a recording to the wrong question.

## Fixes
- **Voice overwrote typed text** — the speech-to-text wrote into the same field as the typed answer and rebuilt it from empty; it now **appends** to the existing transcript.
- **Answers lost unless you clicked Next** — autosave and the timer-driven auto-advance read a stale snapshot and flushed an empty answer over a real one; they now read the latest state, and the server won't overwrite a saved answer with a blank one.
- **Recording under the wrong question** — a clip is now pinned to the question it was recorded on, \"Next\" is disabled while recording, and the server refuses audio on a non-voice question.

## Key files
- \`client-interface/app/mentee/interviews/[taskId]/page.tsx\`, \`server/src/services/interviewSessionService.js\`" \
  "bug,frontend,backend,mentee,mentor"

create_issue \
  "FEAT-43: AI grading of interview voice answers from the audio (Whisper, BYO key)" \
  "## Summary
The interview AI grader now listens to the actual recording instead of the browser's (often garbled) live transcript.

## What's included
- Server-side **Whisper transcription** (\`groqService.transcribeAudio\`) on the mentor's own AI key (Groq \`whisper-large-v3\` / OpenAI \`whisper-1\`).
- **\"AI grade (from audio)\"** re-transcribes a voice answer and scores it against the rubric with an improved prompt (ignore transcription noise; use the at-bar / above-bar / red-flag rubric). The accurate transcript is shown in the review.
- The AI grade button is on **every** question now (mentor-initiated, runs on the BYO key), with a hint pointing to **Settings -> AI Connections**.

## Key files
- \`server/src/services/{groqService,interviewSessionService}.js\`, \`client-interface/components/mentor/InterviewReviewDrawer.tsx\`, \`lib/services/interview-api.ts\`" \
  "enhancement,backend,frontend,mentor"

create_issue \
  "ENH-46: Proctor snapshot carousel in the interview review" \
  "## Summary
The ~40 proctor webcam images were a strip of tiny thumbnails you opened one at a time. They're now a full-screen **carousel** — prev/next arrows, keyboard left/right, a \"12 / 41\" counter, and a thumbnail strip (collapses to a plain viewer for a single image).

## Key files
- \`client-interface/components/mentor/InterviewReviewDrawer.tsx\`" \
  "enhancement,frontend,mentor,ux"

create_issue \
  "BUG-10: Interview / quiz tasks accepted stray generic \"Submit Work\" submissions" \
  "## Summary
An interview task could accumulate extra plain-text submissions (a mentee could pile on v2/v3 after a request-changes), which showed as duplicate review entries.

## Fixes
- The generic submit endpoint now **rejects** a \"Submit Work\" submission on an interview or quiz task — those are completed only through their runners. Authoritative, so a stale / bookmarked client can't bypass it.
- The generic submit page redirects interview / quiz tasks to their runner; fixed a malformed dashboard \"Submit\" link.

## Key files
- \`server/src/services/submissionService.js\`, \`client-interface/app/mentee/tasks/[id]/submit/page.tsx\`, \`components/mentee/dashboard/UpcomingTasks.tsx\`" \
  "bug,backend,frontend,mentee,mentor"

create_issue \
  "FEAT-44: Mentor-selected partial redo of specific interview questions" \
  "## Summary
A mentor can send an interview back for **only** the questions that came back missing or unclear, instead of the mentee redoing everything or nothing.

## What's included
- A **\"Redo\" checkbox per question** in the interview review; ticking any switches the footer action to **\"Send back to redo (N)\"** (no star rating required).
- The mentee re-answers **only** those questions in the runner (redo mode), each with its original per-question timer, fresh. The **same session is re-opened in place**, so every other answer, the proctor log and the attempt number are preserved; new answers overwrite the old.
- Works **regardless of the full-retake setting**; re-submitting clears the flags and lands a fresh submission version for review. No DB migration (stored in the session meta).

## Key files
- \`server/src/services/interviewSessionService.js\`, \`routes/interviews.js\`, \`controllers/interviewController.js\`, \`client-interface/components/mentor/InterviewReviewDrawer.tsx\`, \`app/mentee/interviews/[taskId]/page.tsx\`" \
  "enhancement,frontend,backend,mentor,mentee"

create_issue \
  "FEAT-45: Multi-role clan membership (mentee + co-mentor in one clan)" \
  "## Summary
A person can now hold **more than one role in the same clan** — most importantly, a mentee promoted to co-mentor keeps learning in that clan.

## The bug this fixes
\`clan_memberships\` was UNIQUE (clan_id, user_id), so \`addMember\` **overwrote** the role in place: promoting a mentee to co-mentor **destroyed their mentee row**. They vanished from the clan roster and from \"My Mentees\", and could no longer be assigned tasks.

## What's included
- **Migration 075** widens the key to (clan_id, user_id, role) and **repairs** the mentee rows the old upsert clobbered (idempotent, transactional, with a \`--dry-run\` preview). Restores each person's mentee row + original enrollment.
- \`addMember\` **grants** roles instead of swapping wholesale; only lead/co/core are mutually exclusive. \`removeMember\` drops **one** role (or, with no role, evicts).
- A **mentor can be added as a mentee** of another clan — the picker no longer filters to base-role mentees (admins excluded), and surfaces the role in the UI.
- **One mentee placement at a time**, enforced in the service with a message naming the clan they're already in (409).
- **No self-review**: a co-mentor who is also a mentee can't approve/score their own work, and their own work is filtered out of their approvals queue.
- Fixed two latent bugs found on the way: authz scope resolvers now pin \`role: 'mentee'\` (a mentor learning in another clan no longer breaks their own mentors' access), and \`_isMentorForMentee\` uses \`mentoredClanIds\` so IAM-granted co-mentors can assign tasks.

## Migration
\`node server/scripts/migrations/075_clan_membership_multi_role.js\` (run \`--dry-run\` first — it prints exactly which accounts it will repair).

## Key files
- \`server/scripts/migrations/075_clan_membership_multi_role.js\`, \`server/src/services/{clanService,authzService,taskService,submissionService}.js\`, \`server/src/models/programs/ClanMembership.js\`, \`client-interface/app/{mentor/clan-team,admin/clans}/page.tsx\`" \
  "enhancement,backend,frontend,admin,mentor,mentee"

create_issue \
  "FEAT-46: Role-scoped notifications (bell + list follow the active portal)" \
  "## Summary
Notifications are now scoped to the role you're currently viewing. A dual-role mentor/mentee no longer sees the other hat's items mixed in.

## What's included
- Every notification carries an **\`audience\`** (mentor | mentee | admin | any), resolved once at dispatch and stored on the row.
- The **bell count and list** show only the active role's items; \`any\` (system/security) always shows. An **\"All\"** toggle reveals everything, so nothing is ever hidden for good.
- Single-role users are unaffected (they never receive the other role's notifications).

## Correct-by-construction for future notifications
\`audience\` lives in the central \`NOTIFICATION_MATRIX\` — the one file every notification must be registered in — and a **completeness test fails CI** if a new event omits it. At dispatch, the concrete \`actionUrl\` role wins (per-recipient-correct when one event fans out to several roles), falling back to the declared audience, then \`any\`.

## Migration
\`node server/scripts/migrations/076_notification_audience.js\` — purely additive (NOT NULL DEFAULT 'any') with a one-time backfill from the action-URL namespace (~99.7% of existing rows classify; the rest stay 'any').

## Key files
- \`server/src/config/notificationMatrix.js\`, \`server/src/services/notificationOrchestrator.js\`, \`server/src/models/messaging/Notification.js\`, \`server/scripts/migrations/076_notification_audience.js\`, \`client-interface/components/shared/NotificationDrawer.tsx\`, \`components/shared/notifications/NotificationsPage.tsx\`" \
  "enhancement,backend,frontend,admin,mentor,mentee"

create_issue \
  "ENH-47: Cut task-approval latency and the admin clan-health N+1" \
  "## Summary
Performance work on the slowest mentor/admin screens, with **no behavioural change** — every side-effect stays synchronous and correct (no eventual-consistency or crash-drop risk).

## What's included
- **\`reviewSubmission\`**: dropped the heavy 7-table \`getSubmissionById\` re-fetch at the end (the notification title is already loaded on \`task.roadmapTask\`) and return the in-hand submission. All 6 callers discard the return, so the sparser shape breaks nothing.
- **Gamification**: \`checkAndAwardBadges\` bulk-fetches owned badges once (Set lookup) instead of a \`findOne\` per badge, and threads \`menteeProfile\` so \`checkBadgeCriteria\` stops re-querying it; \`updateLeaderboardEntry\` runs its 4 period upserts in parallel.
- **Admin dashboard + Insights**: extracted the cohort bulk-preload into \`cohortService.preloadMenteeData()\` and reused it in \`clanHealthService\`, collapsing ~5xN per-mentee queries into ~6 bulk queries.

## Note
This supersedes the fire-and-forget approach proposed in #524 (backgrounded roadmap advance + enrollment stats, and a \`setTimeout\` \"lock yield\" premised on SQLite — prod is Postgres). The optimisations here get the win without the data-loss risk.

## Verification
\`reviewSubmission\` driven end-to-end (task/submission/points/feedback/enrollment-stats/notifications intact); the preload path proven **byte-identical** to the per-mentee fallback, enrollment-scoping preserved.

## Key files
- \`server/src/services/{submissionService,gamificationService,cohortService,clanHealthService}.js\`" \
  "enhancement,backend,performance,admin,mentor"

create_issue \
  "BUG-11: Interview / quiz tasks opened in the generic task view from Cohort Review" \
  "## Summary
On the **Cohort Review** page, opening an interview or quiz task — or clicking through to review it — dropped the mentor into the plain task/review drawer instead of the interview/quiz review (answers, recordings, per-question scoring, proctor photos).

## Root cause
\`mentor/review/page.tsx\` rendered \`MenteeTaskDrawer\` / \`ReviewDrawer\` with **no type branching**, in both flows (opening a task, and reviewing one). The Approvals page already branched correctly; Cohort Review never did.

## Fixes
- Both flows now route by type: interview -> \`InterviewReviewDrawer\`, quiz -> \`QuizReviewDrawer\`, everything else keeps the existing drawers.
- \`TaskDrawerById\` (used by Approvals + the mentee-detail page) had the **same latent bug for quiz** — it branched interview but let quiz fall through. Fixed, so every entry point is consistent.

## Key files
- \`client-interface/app/mentor/review/page.tsx\`, \`client-interface/components/mentor/TaskDrawerById.tsx\`" \
  "bug,frontend,mentor"

create_issue \
  "BUG-12: Clan switcher didn't scope the Approvals page" \
  "## Summary
For a mentor in two or more clans, picking a clan in the sidebar changed **nothing** on **Approvals** — the same submissions showed for every clan.

## Root cause
\`useMentorApprovals\` had **zero clan awareness**, and \`ApprovalItem\` carried **no clan field at all**, so the client couldn't filter even if it wanted to. (Pages built on \`useMentorCohort\` — Cockpit, At-risk, Leaderboard, My Mentees — were already scoped, which is why only Approvals looked broken.)

## Fixes
- Server: a batched \`_clanByMentee(mentorId, menteeIds)\` helper (mirroring how \`getCohort\` attaches clans) so all three lists carry \`clan: { id, name }\` — the review queue, **Sent back** and **Reviewed**.
- Client: \`useMentorApprovals\` reads \`activeClanId\` and filters all three lists, using the same fetch-once/filter-in-memory shape as \`useMentorCohort\` — switching is instant, no refetch. Header counts, tab badges and empty states all derive from those lists, so they update too.

## Still unscoped (follow-up)
\`mentor/tasks\`, \`mentor/interviews\`, \`mentor/quizzes\`, \`mentor/announcements\` and \`mentor/library\` fetch their own data and still ignore the clan switcher.

## Key files
- \`server/src/services/submissionService.js\`, \`client-interface/lib/hooks/mentor/useMentorApprovals.ts\`" \
  "bug,backend,frontend,mentor"

# ════════════════════════════════════════════════════════════════════════════
#  Cohort-review live video (Jitsi) + related — delivered this batch
# ════════════════════════════════════════════════════════════════════════════

create_issue \
  "FEAT-47: Live video for the cohort review (self-hosted Jitsi)" \
  "## Summary
Mentors can run a **live video call** with their clan during a cohort review, embedded directly in Pathment. The video runs on a **self-hosted Jitsi** at \`meet.pathment.me\`; the whole feature sits behind a flag so it can ship dormant.

## What it does
- Start / resume / end the room from the review page; mentees join **through Pathment** with their name + profile photo pre-set. Pathment is never in the media path.
- **No media is recorded or stored** (Jibri is not installed) — only attendance/contribution metadata.
- Provider-flexible: all Jitsi coupling is the \`JITSI_DOMAIN\` env var.

## Config
- \`REVIEW_MEETING_ENABLED\` (master), \`JITSI_DOMAIN\`, \`REVIEW_CONTRIBUTION_SECONDS\`/\`_POINTS\`.

## Key files
- Server: \`src/services/reviewMeetingService.js\`, \`src/config/reviewMeeting.js\`, \`src/controllers/reviewMeetingController.js\`, migration \`083_review_meeting.js\`
- Client: \`components/shared/JitsiRoom.tsx\`, \`components/mentor/ReviewMeetingPanel.tsx\`
- Reference: \`docs/COHORT-REVIEW-VIDEO.md\`" \
  "enhancement,backend,frontend,mentor,mentee"

create_issue \
  "FEAT-48: Real-time 'Join review' banner for mentees" \
  "## Summary
When a mentor starts a review call, every mentee in that clan gets an **instant Join banner** on their dashboard.

## How
- Start emits a Socket.IO \`review:started\` to each clan mentee (\`emitToUser\`); the banner also polls every 12s as a fallback.
- \`activeForMentee\` returns the live session only if the mentee is an active member of the clan, the meeting started within the last 3h (staleness guard) and hasn't ended.

## Key files
- Client: \`components/mentee/ReviewJoinBar.tsx\` (mounted in \`app/mentee/layout.tsx\`)
- Server: \`reviewMeetingService.activeForMentee\` / \`_notifyMenteesStarted\`, \`src/socket/index.js\`" \
  "enhancement,backend,frontend,mentee"

create_issue \
  "FEAT-49: Optional attendance tracking from the review call" \
  "## Summary
A **Track attendance** toggle (default OFF) on the mentor's live panel. When ON, joining the call auto-marks a mentee **present**.

## Details
- OFF = a general call, no attendance touched. ON = joining marks present (overrides a prior *absent*, respects *excused*).
- Turning it on **mid-call retroactively** marks everyone already in the room.
- A 15s **presence heartbeat** from the mentee keeps 'who's in the room' fresh (covers someone who stayed connected across a restart).
- Each new call is a **fresh attendance slate** (keeps manual marks).

## Key files
- Server: \`reviewMeetingService.setAttendanceTracking\` / \`selfPresent\` / \`startMeeting\`, model \`CohortReviewSession\`, migration \`084_review_attendance_tracking.js\`
- Client: \`ReviewMeetingPanel.tsx\`, \`ReviewJoinBar.tsx\`" \
  "enhancement,backend,frontend,mentor,mentee"

create_issue \
  "FEAT-50: Speaking time & contribution points in the review" \
  "## Summary
The call estimates each mentee's **speaking time** and pre-selects speakers for a **contribution point**.

## How
- Two trackers feed one field (server keeps the max): the **mentee self-reports** its own dominant-speaker time, and the **mentor** maps dominant-speaker events to the roster.
- Jitsi only exposes 'dominant speaker' (sticky through silence), so each continuous span is **capped at 15s** to stop silence inflating it — it's an estimate, not a stopwatch.
- Anyone past \`REVIEW_CONTRIBUTION_SECONDS\` (20) is pre-checked; awarding runs through \`gamificationService\` (idempotent per session x mentee).

## Key files
- Client: \`JitsiRoom.tsx\` (\`dominantSpeakerChanged\`, \`onSelfDominantChange\`, name capture), \`ReviewMeetingPanel.tsx\`, \`ReviewJoinBar.tsx\`
- Server: \`reviewMeetingService.recordTalkTime\` / \`proposeContribution\` / \`finalizeContribution\`" \
  "enhancement,backend,frontend,mentor,mentee"

create_issue \
  "ENH-48: 'Coming soon' gating + reusable ComingSoon component" \
  "## Summary
So a not-yet-live feature can be teased instead of hidden.

- A **session-independent** config endpoint (\`GET /mentor/review/meeting-config\`) lets the panel decide to show / hide / tease **before** any session exists (fixes a bug where a draft session leaked the live UI into prod).
- New reusable **\`<ComingSoon>\`** teaser (\`components/shared/ComingSoon.tsx\`) — drop it in for any gated feature. In prod the review video shows this teaser (\`REVIEW_MEETING_COMING_SOON=true\`).

## Key files
- \`components/shared/ComingSoon.tsx\`, \`ReviewMeetingPanel.tsx\`, \`reviewMeetingController.config\`" \
  "enhancement,frontend,backend,ux"

create_issue \
  "ENH-49: End review from the call + profile photos + clean restarts" \
  "## Summary
Polish so the call behaves the way mentors expect.

- **Hanging up ends & scores** — the Jitsi red button (\`readyToClose\`) runs the same End & score flow as the panel button (idempotent so they can't double-fire).
- **Profile photos in the call** — dropped \`disableThirdPartyRequests\` (it was blocking external avatar images) and wired the mentee's avatar, so people show their Pathment photo (initials as fallback).
- An **ended** call shows 'Start a new call' after a refresh (not a misleading 'Resume').
- **P2P disabled** on the server so 2-person calls use the bridge (required for speaking-time to work).

## Key files
- \`JitsiRoom.tsx\`, \`ReviewMeetingPanel.tsx\`, server \`meet.pathment.me\` \`config.js\`" \
  "enhancement,frontend,mentor,ux"

create_issue \
  "FEAT-51: 'New mentee' badge (joined under 10 days)" \
  "## Summary
Mentees who joined within ~10 days get a **New** badge so mentors know who's just starting.

- Shows on the **cohort review header**, the shared **mentee cards** (Cockpit / My Mentees / At-risk).
- Computed from the user's join date (\`NEW_MENTEE_DAYS = 10\`); \`isNew\` / \`daysSinceJoined\` flow through the cohort payload.

## Key files
- Server: \`cohortService.getCohort\`
- Client: \`components/mentor/MenteeCard.tsx\`, \`app/mentor/review/page.tsx\`, \`lib/hooks/mentor/useMentorCohort.ts\`" \
  "enhancement,backend,frontend,mentor"

create_issue \
  "ENH-50: Assign the next roadmap step at submission (not approval)" \
  "## Summary
A mentee on a roadmap no longer sits idle waiting for the mentor to review before the next task appears.

- On **submit**, the next **within-roadmap** step is assigned immediately (\`advanceOnSubmission\`, idempotent).
- The **approval** side still handles last-step completion and cross-roadmap chaining (idempotent safety net).

## Key files
- \`server/src/services/linearRoadmapService.js\` (\`advanceOnSubmission\`), \`submissionService.js\`" \
  "enhancement,backend,mentee,mentor"

create_issue \
  "CHORE-01: Self-host the review video (Jitsi on Oracle) + move API to Heroku" \
  "## Summary
Infrastructure to support the live-video feature and cut the expiring DigitalOcean spend.

- Stood up a **self-hosted Jitsi** at \`meet.pathment.me\` on an Oracle Cloud Always-Free Ampere VM (Ubuntu 22.04): prosody + jicofo + JVB + nginx + coturn, Let's Encrypt, P2P off, NAT harvester, colibri-ws.
- Migrated the **production API off DigitalOcean to Heroku** (container + Postgres add-on); frontend stays on Vercel. One Jitsi box serves both staging and prod.
- **No media stored** (no Jibri). Logs are metadata-only, at \`info\`, with size-capped rotation.

## Ops
- Server setup, credentials, gotchas and fixes: \`OPS-RUNBOOK.local.md\` (gitignored)." \
  "chore,backend"

create_issue \
  "CHORE-02: Docs — cohort-review live video reference" \
  "## Summary
A self-contained reference so the feature isn't tribal knowledge.

- \`docs/COHORT-REVIEW-VIDEO.md\` — architecture, every file + what it does, the flows, data model, config flags, deploy, and known limitations. Written for a human or an AI agent to pick up cold.
- Linked from \`docs/ARCHITECTURE.md\` (section 11)." \
  "chore,frontend,backend"

echo ""
echo "Done."
