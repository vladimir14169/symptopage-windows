# Apple roadmap — iPhone now, Apple Watch next

## Current state (0.5.0)

- `ios/SymptoPageCore` — Swift package (Foundation only) porting the shared rules; tests against fixtures from the Windows core. **Not compiled yet**: there is no Mac, and Swift hangs under WSL1. Verify with `swift test` on a Mac or with `.github/workflows/ios.yml`.
- `ios/SymptoPage` — SwiftUI app (iOS 17+). **Not compiled or run yet.**
- watchOS — not started (this document).

### What is reused from Windows and what is new

| Reused as-is | Re-implemented in Swift | iOS-only |
|---|---|---|
| Concepts and IDs, JSON schema v2, backup format v1, validation codes, `i18n.json` texts and plural rules, test fixtures (`tests/fixtures`), design tokens, user flows | Model, validation, migration, commands, schedule, merge, translator (`SymptoPageCore`) | SwiftUI screens, `UNUserNotificationCenter` planning, file protection, share sheet PDF |

Electron cannot run on iOS, and a WebView wrapper would lose native notifications, would not suit watchOS, and complicates App Review. That is why the client is native SwiftUI.

## Differences between iOS (sources) and Windows 0.5.0

| Area | Windows | iOS |
|---|---|---|
| Attachments | yes | no (planned: Photos/Files picker with `completeFileProtection`) |
| Reminders | only while the app runs (window or tray) | delivered by iOS even when the app is closed; at most 60 pending, refreshed on launch/changes |
| Delete with consequences dialog | yes | doctor delete exists in core; the UI offers archive only |
| Report | full sections and options | summary + medications + questions + chronology; period and doctor filter |
| Progress charts | bars with gaps | self-assessment + coverage text |
| Draft restore on filter change | yes | forms are modal sheets (filter does not re-render them) |
| Recovery | restore backup / start empty | start empty (keeps damaged file) |
| Print | system dialog | through the share sheet |
| Data at rest | not encrypted | iOS Data Protection (`completeFileProtection`) |

## Apple Watch — architecture for the next stage

### Goals

Quick symptom entry (one tap + optional dictation) and dose confirmation from the wrist, including when the iPhone is not reachable.

### Components

```
watchOS app ─ SymptoPageCore (same package) ─ local Outbox (file) ─┐
                                                                   │ WatchConnectivity
iPhone app  ─ SymptoPageCore ─ Inbox processor ─ records.json ◄────┘ transferUserInfo (queued, retried by the OS)
                              └─ applicationContext snapshot → watch (today's doses, observations)
```

### Change envelope (both directions)

```json
{ "changeId": "uuid", "origin": "watch|phone", "deviceSeq": 42,
  "entity": "entry|doseEvent|dailyRating", "op": "upsert|delete",
  "recordId": "…", "baseUpdatedAt": "…|null",
  "eventTime": "when it happened (occurredAt / actualAt)",
  "createdAt": "when it was recorded on the origin device",
  "payload": { …record fields… } }
```

- **Queue and repeat delivery:** the watch writes changes to a durable outbox and sends them with `WCSession.transferUserInfo`. The OS queues and retries; the watch keeps an item until the phone acknowledges its `changeId`.
- **Duplicates:** the phone stores processed `changeId`s (with a time limit). Entries have IDs from the watch. Dose events use the deterministic `course@date Ttime` ID, so the same mark arriving twice is one record.
- **Conflicts:** an upsert with `baseUpdatedAt` older than the phone's `updatedAt` is a conflict. Dose marks keep the latest `createdAt`. Entry edits keep the phone version and save the watch version as a conflict copy that the user sees. Deletes win over edits only if `baseUpdatedAt` matches.
- **Times:** `eventTime` (when it happened) and `receivedAt` (set by the phone on arrival) are stored separately. Reports use the event time.
- **Updates and deletes**, not only additions, go through the same envelope.
- **Sync state shown to the user:** "N changes waiting for iPhone", the time of the last successful exchange, and conflicts to review. There are no promises of continuous connection or guaranteed background execution.

### Separate decisions (not part of the next stage by default)

- **HealthKit / sensors** (heart rate etc.): not enabled. They need an agreed purpose, the minimal read permissions, and an App Review privacy declaration. The "resting heart rate" in the mock-ups is not implemented.
- **Complications / Smart Stack widget:** possible after the core works.

### Tests that require a real iPhone + Apple Watch pair

The simulator does not count as these tests.

1. iPhone in airplane mode → 3 entries on the watch → reconnect → exactly 3 entries on the phone, with the watch event times.
2. Same dose marked on the watch and on the phone while offline → one dose event, the later mark wins.
3. Watch app killed with items in the outbox → they are delivered after it starts again.
4. iPhone app not running → `transferUserInfo` is delivered when it is next launched or woken.
5. Time-zone change on both devices between entry and sync.
6. Edit on the phone and delete on the watch of the same entry → the conflict is shown and nothing is lost silently.
7. Reminder on the watch (mirrored from the iPhone notification): marking "taken" from the notification.

## iOS release path

1. Build and fix on a Mac (Xcode 26+; Xcode 27 is current as of 2026-10-03). Make the `ios.yml` CI pass.
2. Run on a device (free Personal Team is enough; the profile expires after 7 days).
3. Apple Developer Program → TestFlight → App Store. Needs: logo/app icon, privacy policy, App Privacy "Data Not Collected" declaration (if still true), medical disclaimer in the description, and the licence decision.
