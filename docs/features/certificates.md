# Certificates

**What it is:** the credential a mentee walks away with. An admin designs a **template** once
- background, logo, text and badge **layers** - and defines the **types** (tiers) it can be
issued at: Participation, Bronze, Silver, Gold, or anything they invent. Each type carries
**criteria** (score, completion, on-time rate, rating, attendance, keywords, free-text rules).
An AI pass grades every mentee against those criteria and proposes a type; a human confirms
and issues. Recipients see their certificates and download them as PNG.

**Why it exists:** finishing a fellowship should produce something shareable, and "who deserves
which grade" should be answered from the mentee's real record rather than from memory.

## Data model
`CertificateTemplate` - `config` (JSONB, the **layers**), `criteria` (JSONB, the **types**),
`bgImageUrl` / `logoUrl` / `logoConfig`, `programId`, `aiEvaluation` (last grading run).
`CertificateInstance` - one issued credential: `templateId`, `menteeId`, `mentorId`,
`issuedBy`, **`tier`** (which type it was awarded at), `metadata`.
`AIEvaluationQueue` - one row per mentee per grading run. Migration 097.

## Backend
- **`/api/certificates/templates`** CRUD (admin) + `GET /:id/qualification` (who qualifies for
  what), `GET /:id/history`, `POST /:id/send-to-mentors`, `POST /:id/ai-evaluate` +
  `/ai-evaluate/status`.
- **`/api/certificates/instances`** `POST` to issue (admin/mentor), `GET /mentee/:menteeId`,
  `GET /:id`, `DELETE /:id`, `POST /:id/resend`.
- `certificateService` owns qualification scoping (a mentor only ever sees their own clans'
  mentees), the AI grading pipeline, and issuance. `certificateWorker` drains the evaluation
  queue in batches.
- **The server never renders the image.** It stores and validates the design; the picture is
  drawn in the browser (below). `CertificateInstance.imageUrl` is therefore normally null.

## Frontend
- **Admin:** `/admin/certificates` (list) and the builder at `/admin/certificates/new` /
  `/admin/certificates/[id]/edit` - `CertificateEditor`, a drag-and-drop canvas of layers plus
  the types table, the AI grading run, and the recipient roster.
- **Mentor:** `/mentor/certificates` - grade and issue within their clans, view their own.
- **Mentee:** `/mentee/certificates` - view, download PNG, share to LinkedIn.
- **Rendering** lives in `lib/utils/certificate-renderer.ts` (2D canvas → PNG, the download
  path) and `components/certificates/shared/CertificatePreview.tsx` (the on-screen path).
  **These two must agree** - the preview is a promise about what downloads.

## Tier-aware layers (one design, several outcomes)

A template is authored once but issued at whichever type the recipient earned, and usually only
a little should differ between a Gold and a Participation award: a line of wording, the badge,
a seal the top type alone gets. Splitting the template per type would mean four near-identical
designs that drift apart the first time somebody moves the signature line. So the **layer**
carries the variation, via two optional fields on any element in `config`:

| Field | Meaning |
| --- | --- |
| `tierValues: Record<tierId, string>` | what this layer says (text) or shows (badge URL) on each type |
| `visibleForTiers: string[]` | render this layer **only** for these types |

- **Both are opt-in.** Absent or empty means "every type", which is what every layer authored
  before these fields existed means - so an untouched template renders exactly as it did.
- **A missing or blank entry falls back**, it does not blank the layer: text falls back to the
  layer's own `text`, a badge to that type's `criteria[].badgeUrl`. Filling in only the types
  that differ is the normal way to use it.
- **Variables still work inside per-type wording** - `Awarded to {{mentee_name}} with
  Distinction` is a valid Gold-only line. `{{tier_name}}` resolves to the type's display name
  and is the one-liner alternative to authoring each type by hand.
- **Badge resolution order** (most specific first): the layer's own art for this type →
  the caller's `badgeUrlOverride` (the legacy single-badge path) → the layer's fixed
  `badgeUrl` → the type's `criteria[].badgeUrl`.
- **A template may hold several badge layers.** The earned-type badge and a Gold-only seal are
  two layers, not two templates.
- In the builder, the **Previewing** switcher above the canvas renders any single type, and
  layers that type does not get are dimmed rather than hidden (so they stay draggable).

Resolution is a small set of pure functions - `resolveText`, `resolveBadgeUrl`,
`isElementVisibleForTier` in `lib/utils/certificate-renderer.ts` - shared by both renderers.

## Role flows
- **Admin:** designs the template and its types, sets criteria per type, runs the AI grading,
  reviews and overrides the proposed type per mentee, issues. Can share a template with mentors.
- **Mentor:** runs grading and issues **within their own clans only** (`getMentorScopedMenteeIds`).
- **Mentee:** receives a notification + email, then views and downloads from `/mentee/certificates`.

## Rules & edge cases
- **Tier ids inside a layer are never validated against the template's criteria.** Criteria and
  layout are edited independently, so checking the reference would make a template unsavable the
  moment somebody renamed a type. The renderer falls back cleanly for a key it does not know.
  Deleting a type in the builder *does* strip its keys from every layer, so a re-used id cannot
  silently inherit wording nobody wrote for it.
- AI grading is advisory. `isTierAllowed` + `buildHardConstraintFailures` keep a proposal inside
  the hard constraints, and a human still confirms before anything is issued.
- Paused and suspended mentees are listed separately and are never auto-selected for issuance.
- A per-type value is capped at 2000 characters - long enough for a paragraph or a signed
  Cloudinary URL, short enough that the JSONB column is not free storage.

## Related
[Gamification](./gamification.md) (badges the mentee earns *during* a program) ·
[Enrollment & Progress](./enrollment-and-progress.md) (the record grading reads) ·
[Programs, Cohorts & Clans](./programs-cohorts-clans.md) (what a mentor may issue within) ·
[AI Integration](./ai-integration.md) (the grading pass)
