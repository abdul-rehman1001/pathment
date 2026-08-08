# Pathment Mobile: technology choice and scope

Status: recommendation, not yet decided
Written: August 2026

## The decision

Which technology to build the Pathment mobile app in, what the first version should do, and how to keep it fast and cheap on battery.

**Recommendation: React Native, using Expo with a development build (not Expo Go).**

The reasoning is below. The short version: our live video requirement rules out the web-wrapper options, and our team's existing language rules in React Native over Flutter. Those two constraints decide it before preference enters the picture.

---

## 1. Constraints that come from our actual product

These are not general mobile considerations. They are things our codebase already does, and any choice has to survive them.

**Live video is the hard constraint.** We run self-hosted Jitsi at `meet.pathment.me` for cohort reviews. Jitsi publishes official mobile SDKs for React Native and Flutter, both wrapping the same native iOS and Android SDKs. It does not publish one for Capacitor or Cordova. Running Jitsi inside a webview is possible but gives up native audio routing, proper background handling, and CallKit/ConnectionService integration, which is exactly where mobile calls feel broken.

**We are realtime, and we currently fake it with polling.** The web client polls hard: the mentee join bar every 12 seconds, the review roster every 8, a presence heartbeat every 15, a talk-time flush every 20. That is fine on a laptop on mains power. On a phone it is a battery and data problem, because each poll wakes the radio. Mobile must move to sockets plus push notifications. We already have Socket.io and a notification system, so the server work is small.

**Three roles, very different mobile value.** Mentees are the volume and their daily loop is genuinely mobile. Mentors do quick triage on the move but real review work on a desktop. Admin work is desktop, full stop.

**We already have a design system.** Brand token, warm canvas, accent picker, defined radii and fonts. Whatever we choose has to be able to express it, not fight it.

---

## 2. The options

### React Native (Expo, development build) — recommended

**For**
- The team writes TypeScript and React every day. No new language, and the mental model of components, hooks and state carries over directly.
- We can share types, validation and API client code with the web app rather than reimplementing them and letting them drift.
- Jitsi ships an official React Native SDK, so video is a supported path rather than a workaround.
- Expo gives us over-the-air updates for JS changes, which means copy fixes and small bugs ship without an App Store review cycle. For a product still finding its shape, that matters more than it sounds.
- Push notifications, secure storage, camera and file upload are solved, documented problems.

**Against**
- Expo Go will not work. The Jitsi SDK needs native code, so we need a development build and `expo prebuild`. This is a real step up in build complexity from "scan a QR code".
- Jitsi plus Expo has known integration friction. Reports include dependency conflicts around React Native versions and clipboard, and there is no official Expo config plugin for Jitsi that I could find. Budget real time for this specific integration, and prove it before committing.
- Heavy list rendering and complex animation need care to stay at 60fps. Our screens are mostly lists and forms, so this is manageable, but it is not free.

### Flutter

**For**
- Excellent rendering consistency across devices and generally strong animation performance out of the box.
- Jitsi ships an official Flutter SDK too, so video is equally viable.
- Strong tooling and a mature widget set.

**Against**
- Dart. Nobody on the team writes it. That is a hiring constraint, a review constraint, and a context-switching cost on every single change, forever.
- Zero code sharing with the web app. Types, API client, validation rules and business logic all get written twice and drift apart. We have already seen what drift costs us on the web side.
- Our design system would need rebuilding in Flutter's idiom rather than ported.

Flutter is a good technology. It is the wrong one for a team whose entire codebase is TypeScript.

### Native (Swift + Kotlin)

**For**
- The best possible performance, battery behaviour and platform integration. Jitsi's native SDKs are what the other options wrap.

**Against**
- Two codebases, two languages, two release pipelines, for a team that currently has neither skillset.
- Roughly double the build and maintenance cost for a gain our users will not perceive on task lists, forms and chat.

Revisit only if the app becomes the primary product and video quality becomes a competitive differentiator.

### PWA or Capacitor wrapper

**For**
- Cheapest by a distance. Reuses the Next.js app almost as-is.

**Against**
- Jitsi in a webview is the problem. Audio routing, background calls and interruption handling are all worse, and video in a webview is a known battery drain.
- iOS push for PWAs remains materially weaker than native push, and our whole review flow depends on a mentee reliably getting "your mentor started the review" within seconds.
- It would feel like our website in a box, which is the specific outcome we are trying to avoid.

Worth keeping the PWA as a fallback for low-end Android, but not as the strategy.

---

## 3. What version one should actually do

Not "the web app, on a phone". Pick the things that are genuinely better in a pocket.

**Mentee (build first, this is the volume)**
- Today's tasks, and submitting work including photo and file upload from the phone
- Push notification when a review starts, tapping straight into the call
- Join the live review, audio-first by default
- Daily log and roadblocks, both quick capture, both currently friction-heavy on desktop
- Messages
- Progress and points, read-only

**Mentor (second)**
- Push for new submissions and requests
- Approvals triage: approve, or send back with a short note
- Join and run the review call
- Mentee profile, read-only
- Deliberately **not** in v1: roadmap authoring, bulk review, reports. These are desktop work and cramming them in makes the app worse.

**Admin**
- Nothing in v1. Push notifications for things needing attention, at most. Admin is a desktop job and pretending otherwise wastes the budget.

---

## 4. Battery and performance, concretely

1. **Replace polling with sockets and push.** This is the single biggest battery win available to us and the work is mostly server-side, which we already have the pieces for.
2. **Audio-first in calls.** Default the mentee's camera off on join. Video encoding is the most expensive thing the app will ever do, and in a 24-person review most cameras add nothing.
3. **Cap received video.** Jitsi lets us limit incoming resolution and the number of rendered tiles. A phone should not decode 24 streams.
4. **Never render video in a webview.** Native SDK only.
5. **Let the OS know a call is happening,** via CallKit and ConnectionService, so it schedules us properly and calls survive backgrounding.
6. **Cache reads, queue writes.** Task lists should open instantly from cache and refresh behind. A submission started on the train should send when signal returns rather than being lost.
7. **Measure on a cheap Android device**, not on the newest iPhone. Our users are not all on flagships.

---

## 5. Design direction: not looking AI-generated

The generated look comes from specific, avoidable habits.

**Avoid:** purple-to-blue gradients everywhere, glow and glassmorphism as decoration, an icon in every container, evenly-weighted cards with nothing leading the eye, generic stock illustration, and copy that congratulates the user for existing.

**Do instead:**
- **Follow the platform.** iOS should feel like iOS and Android like Android for navigation, sheets, and gestures. Fighting platform conventions is what makes an app feel foreign.
- **Carry our own brand,** not a template's. We already have the Action Blue token, warm canvas and type scale. Port those honestly instead of inventing a second visual language.
- **Type does the work.** Real hierarchy through size and weight, not through boxes and borders.
- **Earn every animation.** Motion should explain where something came from. Decorative motion is what reads as "made by a machine".
- **Design the empty and failed states first.** They are most of the early experience and are what generated designs never bother with.
- **One accent colour, used sparingly.** When everything is emphasised, nothing is.

---

## 6. Risks and what to verify before committing

| Risk | How to retire it |
|---|---|
| Jitsi + Expo integration friction is worse than expected | **Do this first.** Build a throwaway app that joins a real room on `meet.pathment.me`, on both platforms, before any other work. This is the whole decision. |
| Our Jitsi has no JWT moderator configured | Already an open item on the web side. Mobile makes it more visible, so fix the server first. |
| API assumes a browser session | Check token refresh and socket auth behave on a device that sleeps and changes network. |
| Store review timelines | Register both developer accounts early. This blocks launch, not development. |

**A note on honesty:** I verified that Jitsi publishes official React Native and Flutter SDKs, and that Expo integration has documented friction. I have not built the spike. The recommendation rests on that spike succeeding, and the first task on the plan is to prove it.

---

## 7. Sequence

1. **Spike the Jitsi integration.** Nothing else starts until a real room works on both platforms.
2. **Move realtime off polling** onto sockets and push, server-side. Benefits the web app too.
3. **Mentee v1.** Tasks, submit, daily log, roadblocks, messages, join review.
4. **Mentor v1.** Push, approvals triage, join and run review.
5. **Harden.** Offline queue, low-end Android, battery measurement.

---

## Sources

- [Jitsi Meet React Native SDK](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-react-native-sdk/)
- [Introducing the Jitsi Meet React Native SDK](https://jitsi.org/blog/introducing-the-jitsi-meet-react-native-sdk/)
- [Jitsi Meet Flutter SDK](https://github.com/jitsi/jitsi-meet-flutter-sdk)
- [Jitsi React Native SDK, Expo dependency issues](https://github.com/jitsi/jitsi-meet/issues/15149)
