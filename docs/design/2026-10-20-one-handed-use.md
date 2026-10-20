# One-handed use in the field (spec, 2026-10-20)

Owner, 2026-10-20: after a usability review of thumb reach and ease of use on a big iPhone,
"Do all changes except for 11" (11 was raising small tap targets to 48 pt; not part of this
work). This file is what the website (desktop and phone), the Swift iPhone app (`apps/ios`) and
the Expo app (`apps/mobile`) are built from, so all four platforms say and do the same thing.

"Phones" means the website below 640 px and both native apps. Desktop keeps its layout unless an
item says otherwise.

## 1. Next Step bar on the job page (phones)

A bar pinned to the bottom of the job page, directly above the tab bar, on the same frosted
material as the tab bar (iOS bottom toolbar, not a floating button). It holds one or two pill
buttons, full width when there is one, side by side when there are two. It is hidden when it has
nothing to offer, and hidden while the keyboard is open.

What it shows, first match wins:

| When | Buttons |
| --- | --- |
| The job can be started (Scheduled or Unscheduled) | **Start Job** (primary) |
| Checklist, maintenance visit that can be completed | **Complete Job** (primary) |
| Findings | **Add Test** (primary) · **Add Finding** (secondary) |
| Photos | **Add Photo** (primary) · **Add Video** (secondary) |
| Wrap-Up, no draft yet | **Write Draft** (primary, or **Review with Customer** where the platform shows that instead because it can't write drafts now) |
| Otherwise | nothing (bar hidden) |

- The buttons do exactly what the inline buttons did (same action, confirmation and errors).
- On phones the inline copies they replace are removed: Start Job from the header, Complete Job
  under the checklist, Add Test and Add Finding under their lists. Add Photo / Add Video in the
  Photos card stay (they are already in reach), so the bar on Photos is a shortcut to the same
  capture.
- Desktop is unchanged: the header and inline buttons stay, and the bar never shows.
- Page content gets bottom padding so the last row can scroll above the bar.

## 2. Photos on a new test or finding

The Add Test / Add Finding sheet shows its Photos group from the start (no more "Save the test
first, then add photos."). Tapping **Add Photo** on a test or finding that hasn't been saved
saves it first, with the same checks as Save. If the checks fail, the errors show and no camera
opens. If it saves, the sheet stays open, its title becomes **Edit Test** / **Edit Finding**,
and the camera (or library) opens. Save then works as before.

## 3. Save is always in reach in the Test and Finding sheets

- The sheet's Save button (**Add Test**, **Save Test**, **Add Finding**, **Save Finding**) sits
  in a bar pinned to the bottom of the sheet, above the keyboard when it is open, not at the end
  of the scroll. Cancel stays top left. Delete Test / Delete Finding stays at the end of the
  scroll (away from Save).
- Number and text fields have a keyboard bar with **Previous**, **Next** and **Done** (iPhone
  apps; the website relies on Safari's own bar). In the test sheet, Next moves through the
  readings in order, and the return key does the same on Android.

## 4. Nothing typed is lost

- Report text, checklist notes and "Where", and photo captions save by themselves 1 second after
  typing stops, and when the field or screen is left. No **Save Text** button: it is removed. A
  short "Saved" in secondary text shows after each save.
- Android: the back button on an editor with unsaved changes (Add/Edit Test, Add/Edit Finding,
  photo markup, the signature on Review) asks first, with the same alert as Cancel: title
  "Discard changes?", buttons **Keep Editing** and **Discard Changes** (destructive). A locked
  sheet does the same on back instead of ignoring it.
- Review: Cancel with a signature drawn asks the same.

## 5. Ask before completing sends the report; Undo after Mark Remaining

Owner, 2026-10-20: "maybe when you press complete it prompts you with 'are you ready to send'".

- **Mark Complete** (Today) and **Complete Job** (job page and the Next Step bar) on a
  maintenance visit, in a shop whose visit reports are set to Automatic, ask first with an alert
  (iOS alert, centered; not an action sheet):
  - Title: "Ready to send the visit report?"
  - Message: "Completing this visit sends its report to {customer name}." ("to the customer" when
    there is no name.)
  - Buttons: **Cancel** and **Complete and Send** (the default, bold).
  - Complete and Send completes the visit exactly as before (the report is sent the way it is
    today: straight away, or queued when offline).
- When completing sends nothing (shops set to By Hand or Off, and leak or repair stops on Today),
  there is no prompt: still one tap.
- **Mark N Remaining …** (checklist) stays one tap. Afterwards, in the place of the button, for 5
  seconds: "Marked N" in secondary text and an **Undo** pill (not a toast or snackbar; it sits
  where the button was). The change is saved straight away; Undo clears the items it marked
  (back to To do).

## 6. Report and sign-off

- The report's send controls (customer email / phone, **Send by Email**, **Send by Text**,
  **Download PDF**) come directly under the report's status line, before anything else.
- Earlier versions are folded under a **Versions (N)** disclosure row, closed by default.
- iPhone and Android apps: when offline, **Finish Report**, **Send by Email** and **Send by
  Text** stay enabled. Tapping one keeps the request on the phone and shows "Will send when
  you’re back online." It runs once the signal is back and the job's changes have reached the
  server, the same way automatic visit reports are queued. Write Draft still needs a connection
  and keeps its notice.

## 7. Sideways swipes between sections

All platforms use the website's rule: a swipe changes section only after at least 70 pt
sideways, with the sideways distance at least 1.8 times the vertical. Swipes that start in a
text field, a slider, a signature pad, or a row that swipes by itself (swipe to remove) never
change section. The iPhone and Android apps give a light haptic when the section changes.

## 8. Checklist answers in one tap

- Each item shows its answers as an inline segmented control under the item name, 44 pt tall,
  full row width: leak items **Not Leaking · Leaking · Attention · N/A**, yes/no items
  **No · Yes · N/A**, pool service items **Done · Needs Attention · Skipped** (the existing
  `verdictOptions` labels in `packages/core/src/inspection.ts`). Tapping the
  chosen one again clears it (back to To do). The verdict menu is gone.
- **Remove Item…** is no longer next to the answers: it stays behind Edit and swipe to remove.
- The item's own page (where there is one) ends with **Previous Item** and **Next Item** pills
  in a bottom bar.

## 9. Delete away from Mark Up

Photo cards show **Mark Up** and a round "More" (…) button. Its menu holds **Delete Photo**
(still confirmed). The photo viewer keeps its Delete.

## 10. Taking photos

- **Add Photo** opens the camera straight away (no menu first). A separate **Library** button
  sits next to it (visible, not long press).
- After a photo is taken, the camera opens again for the next one until the tech taps Cancel
  (iPhone and Android apps; the website uses the browser's camera).
- "Attach to" remembers the last choice for the job while the app is open.

## 12. Sync status stays in view

On the iPhone and Android apps, the sync bar ("Offline · 3 changes on this phone") stays pinned
under the navigation bar on Today and the job page instead of scrolling away. It still hides when
everything is saved, and tapping it still opens Sync.

## 13. Keyboard on Android

Fields and sheet buttons stay above the keyboard on Android (edge to edge): use
`react-native-keyboard-controller` or `behavior="height"`, whichever works with the app's
sheets.

## 14. Today's tip

On Today the "Your day, stop by stop" tip shows after the stop list, not above it, so the first
stop's buttons are on screen at launch.

## Low

- **Today:** on a collapsed stop the customer's name is a link to the job, as on an open one. The
  rest of the row (number, time, chevron) opens and closes the card.
- **Messages (Android app):** the conversation has **Mark as Unread** in its menu, as on the
  website and the iPhone app.
- **Live Activity and the Android current-stop notification:** text 15 pt or larger, scaling with
  Dynamic Type on iPhone, and two actions, **On My Way** and **Mark Complete**, that open the app
  on that stop and do it there (with item 5's Undo).
- **Wording:** "Show Draft" / "Hide Draft" becomes a disclosure row named **Report Text**; Save
  Text is removed (item 4). On iPhone, Done buttons sit in the confirmation spot (top right), not
  the cancel spot.
