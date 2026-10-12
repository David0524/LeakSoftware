# Design review: LeakBook media capture and markup (M5)

Reviewed with the Apple Design skill (Apple Human Interface Guidelines, pinned to upstream commit
`904b0ee`). Platform: iPhone first, React Native (Expo). Artifact: the source in `apps/mobile`
(`features/media/MediaSection.tsx`, `features/media/VoiceRecorder.tsx`,
`app/(app)/jobs/[id]/media/[mediaId].tsx`, `ui/MarkupLayer.tsx`, `ui/SyncBar.tsx`,
`app/(app)/settings.tsx`, `app.json`). Contrast is computed from the hex values in
`brand/tokens.json`; layout heights are computed from the styles for a 393 by 852 pt iPhone
(content area 715 pt under the navigation bar). Nothing was checked on a device.

## Summary

The screens' job is to capture evidence fast, point at the problem, and get it to the office,
outdoors and often offline. The thesis holds in most places: three plain capture buttons, captures
saved on the phone first, upload state in words everywhere, and markup drawn as outlined vectors
over an untouched original. The markup is the signature element and is well judged. Rating before
fixes: **Critical issues**. With a portrait photo (the usual way a phone is held), the markup
editor puts Save Markup and Cancel below the screen while scrolling is turned off, so the edit
cannot be saved. Drawing is also drag-only, and several exits discard work without a warning.

## Critical

- **Critical: markup editor controls are out of reach for portrait photos.** The canvas height is
  `width × height/width` (`[mediaId].tsx:330-331`). For a 3:4 portrait photo on a 393 pt phone
  that is 361 × 481 pt. The tools below it (segmented control, colors, hint, Undo/Clear All,
  Cancel/Save Markup, `[mediaId].tsx:157-228`) end about 800 pt down, but the viewport is about
  715 pt and `scrollEnabled={!editing}` (`[mediaId].tsx:122`) blocks scrolling. Save Markup and
  Cancel cannot be reached on any current iPhone. On a 667 pt iPhone SE, Undo is unreachable too.
  With the Text tool, the keyboard also covers the label field. The only way out is the back
  button, which throws the drawing away.
  `designing-for-ios.md › Best practices`: "it tends to be easier and more comfortable for people
  to reach a control when it's located in the middle or bottom area of the display."
  `toolbars.md`: "Group navigation controls and critical actions like Done, Close, or Save in
  dedicated, familiar, and visually distinct sections."
  **Fix:** while editing, (1) move Cancel and Save into the navigation bar with
  `<Stack.Screen options={{ headerLeft: () => <HeaderText title="Cancel" …/>, headerRight: () =>
  <HeaderText title="Save" …/>, headerBackVisible: false, gestureEnabled: false }} />`;
  (2) render the tool bar (segmented control, color swatches, Undo, and the label field for Text)
  outside the `ScrollView` in a fixed bottom view, so `KeyboardAvoidingView` lifts it above the
  keyboard; (3) fit the canvas to the space that is left:
  `maxH = windowHeight - headerHeight - insets.bottom - toolbarHeight`,
  `h = Math.min(width * ratio, maxH)`, `w = h / ratio`, centered. Use `useWindowDimensions`,
  `useHeaderHeight` and `useSafeAreaInsets`, with `toolbarHeight` measured by `onLayout`.

## Improvements

- **High: leaving the markup editor throws away work without a warning.** Cancel
  (`[mediaId].tsx:219-224`), the back button and swipe-back all discard the draft silently. Clear
  All (`[mediaId].tsx:210-216`) cannot be undone, because Undo only removes the last shape.
  `feedback.md › Best practices`: "Warn people when they initiate a task that can cause data loss
  that's unexpected and irreversible." `undo-and-redo.md`: "Let people undo multiple times."
  **Fix:** keep a history stack (`setHistory(h => [...h, draft])` before every change, including
  Clear All) so Undo restores a cleared drawing. When the draft differs from what was saved,
  Cancel shows
  `Alert.alert("Discard markup changes?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Discard", style: "destructive", onPress: … }])`.
  Use `usePreventRemove(editing && dirty, …)` from `@react-navigation/native` to show the same
  alert on back and swipe.
- **High: drawing is drag-only, and a tap with Arrow or Circle does nothing.** `release()` calls
  `shapeFromDrag` with start equal to end and adds nothing (`[mediaId].tsx:343-351`), with no
  feedback. Wet hands, gloves, VoiceOver and Switch Control all struggle with a precise drag.
  `accessibility.md › Mobility`: "Offer alternatives to gestures." `gestures.md › Best practices`:
  "Indicate when a gesture isn't available."
  **Fix:** if the drag is shorter than about 8 pt, place a default shape at the tap: a circle with
  `rx = 0.08` (and `ry` adjusted for the aspect ratio) centered on the tap, or an arrow ending at
  the tap from a point about 0.15 up and to the left (clamped to 0–1). Change the hint to "Tap to
  place, or drag to draw an arrow." and set `accessibilityHint` on the canvas.
- **Medium: "can't be downloaded while offline" appears while the file is still loading.**
  `useMediaUri` returns `null` while it fetches a signed URL and also when the fetch fails
  (`data/media.ts:99-125`). The viewer reads `null` as offline (`[mediaId].tsx:137-146, 375-381,
  298-304`). `loading.md › Best practices`: "Show something as soon as possible."
  **Fix:** return `{ uri, state: "ready" | "loading" | "offline" | "failed" }`. Show an
  `ActivityIndicator` (`color.onHeader`) in the navy frame while loading. Show the offline notice
  only when the sync phase is offline, and on failure show "Couldn't load this file." with a
  "Try Again" button.
- **Medium: permission-denied alerts are dead ends.** "Camera access is off. Turn it on in
  Settings, then try again." (`lib/media.ts:131-132`, shown at `MediaSection.tsx:54-57`) and
  "Microphone access is off" (`VoiceRecorder.tsx:242`) only offer OK. `writing.md › Best
  practices`: "If you need to direct someone to a setting, provide a direct link or button."
  **Fix:** buttons `[{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]`.
- **Medium: two system permission prompts at once on the first Photo tap.**
  `startPositionLookup()` asks for location (`lib/media.ts:83-91`) at the same time as
  `captureWithCamera` asks for the camera (`MediaSection.tsx:50-51`). `privacy.md › Requesting
  permission`: "Request permission only when your app clearly needs access to the data or
  resource." **Fix:** split `ensureCameraPermission()` out of `captureWithCamera`, await it, and
  only then call `startPositionLookup()` and launch the camera, so the location prompt follows a
  granted camera prompt instead of stacking on it.
- **Medium: Cancel throws away a voice note of up to 5 minutes in one tap.** Cancel sits next to
  Stop and Save (`VoiceRecorder.tsx:302-308`). Leaving the screen while recording also discards
  it (`VoiceRecorder.tsx:252-255`). `feedback.md › Best practices` (quoted above).
  **Fix:** rename the button "Discard". When `durationMillis > 5000`, confirm with
  `Alert.alert("Discard this voice note?", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Discard", style: "destructive" }])`.
  On unmount while recording, stop and save (the `stop(true)` path) instead of dropping the file.
- **Medium: delete alert's cancel button is titled "Keep".** `[mediaId].tsx:93`.
  `alerts.md › Buttons`: "Always use 'Cancel' to title a button that cancels the alert's action."
  **Fix:** `{ text: "Cancel", style: "cancel" }`.
- **Medium: an alert is used to validate the text label.** "Type the label first, then tap the
  photo." (`[mediaId].tsx:350`). `alerts.md › Best practices`: "Avoid using an alert merely to
  provide information." **Fix:** when the tap lands with an empty label, pass
  `error="Type the label first."` to the Label `Field` and focus it (`ref.focus()`). Add no
  shape and show no alert.
- **Medium: voice note playback has no seek bar, and may be silent with the Ring/Silent switch
  on.** `AudioBox` offers only play/pause and a time (`[mediaId].tsx:411-440`), and the viewer
  never sets `playsInSilentMode`. `playing-audio.md`: in silent mode a device "plays only the
  audio that people explicitly initiate, like media playback." **Fix:** on mount, call
  `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false })`. Add a seek track: a
  44 pt tall `Pressable` that measures its width with `onLayout` and calls
  `player.seekTo((locationX / w) * status.duration)`, with a filled bar for progress.
  Give it `accessibilityRole="adjustable"`, `accessibilityValue={{ text: "0:12 of 1:30" }}`, and
  increment/decrement actions of ±10 s.
- **Medium: photos cannot be zoomed.** The viewer shows the photo at width with no pinch or
  double-tap zoom (`[mediaId].tsx:375-376`), but techs need to inspect cracks.
  `gestures.md › Standard gestures`: Zoom "Zoom a view; magnify content." **Fix:** when not
  editing, wrap the image and `MarkupLayer` in
  `<ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom>` (iOS), so
  the markup zooms with the photo.
- **Medium: orange marks the editing state.** `photoEditing` uses `borderColor: color.primary`
  (`[mediaId].tsx:465`). House rule: orange only for the primary action. `color.md › Best
  practices`: "Avoid using the same color to mean different things." **Fix:**
  `borderColor: color.water` (`#1F6FAE`).
- **Medium: sync bar truncates the new upload messages and is a small target.** The bar is one
  line (`numberOfLines={1}`), 14 pt, with `minHeight: 36` (`SyncBar.tsx:171, 188, 191`).
  "Offline · 3 changes and 12 photos saved on this phone" (53 characters) needs about 400 pt at
  14 pt (an estimate), but about 340 pt is available. `typography.md › Supporting Dynamic Type`:
  "Keep text truncation to a minimum." **Fix:** `numberOfLines={2}`, `fontSize: 15`,
  `lineHeight: 20`, `minHeight: 44`. Shorten the copy to "Offline · 3 changes, 12 photos on this
  phone".
- **Medium: one thing, four names.** The sync bar says "files" (`SyncBar.tsx:121`), Settings says
  "photos or recordings" (`settings.tsx:19`), the viewer says "capture" (`[mediaId].tsx:70`), and
  the section is "Photos and Notes". `writing.md › Best practices`: "Build language patterns."
  **Fix:** use "photos" when all items are photos and "photos and recordings" otherwise, in the
  sync bar, Settings ("Waiting to upload: 3 photos and recordings") and the sign-out alert. Name
  the item in the viewer: "This photo isn't on this phone." (using `MEDIA_KIND_LABELS`).
- **Medium: capture buttons crowd at large text sizes.** Three buttons share one row, about 112
  pt each (`MediaSection.tsx:73-97, 184`), so "Voice Note" at 18 pt wraps or clips at the
  accessibility sizes. `typography.md › Supporting Dynamic Type`: "consider using a stacked
  layout." **Fix:** `const { fontScale } = useWindowDimensions();` and
  `flexDirection: fontScale >= 1.3 ? "column" : "row"` on the button row.
- **Low: pending-upload badge is lost on bright photos.** A white 22 pt circle with no edge
  (`MediaSection.tsx:196-203`) has nothing to separate it from a white pool deck. The navy icon
  on white is 15.4:1. **Fix:** `borderWidth: 1.5, borderColor: color.navy`.
- **Low: thumbnail grid leaves a ragged edge.** 3 × 104 + 2 × 8 = 328 pt fills only 328 of
  361 pt (`MediaSection.tsx:110`). **Fix:** measure the grid with `onLayout` and size thumbnails
  `(w - 2 * space["2"]) / 3`.
- **Low: color swatches have no group name.** VoiceOver reads "Red, radio button" with no
  context (`[mediaId].tsx:168-187`). **Fix:** `accessibilityRole="radiogroup"` and
  `accessibilityLabel="Markup color"` on the row.
- **Low: location purpose string mentions photos only.** Videos and voice notes are also tagged
  (`app.json:63`). **Fix:** "LeakBook tags photos, videos, and voice notes with where they were
  recorded, so reports show the work was done on site."
- **Low: sign-out alert cancel is "Stay Signed In".** `settings.tsx:28`, carried over from M4.
  `alerts.md › Buttons` asks for "Cancel". Change it for consistency with the delete alert.
- **Low: recording start is silent for VoiceOver.** **Fix:**
  `AccessibilityInfo.announceForAccessibility("Recording")` when `record()` starts, and
  "Voice note saved" after saving.
- **Low: markup outline is thin on thumbnails.** At scale 0.26 the outline adds 0.75 pt on each
  side (`MarkupLayer.tsx:23-24`). **Fix:** `outline = stroke + Math.max(2, 3 * scale)`.

## Craft notes

- **Signature:** the outlined markup reads like marking paint on a pool deck. It is
  recognizable, it belongs to the trade, and it pairs with the severity-colored pins on the pool
  diagram. Keep markup to these three shapes and three colors.
- **Restraint:** one orange button per state (Stop and Save; Save Markup). The editing border is
  the only stray use (above).
- **Reassurance copy is good:** "The original photo is never changed. Markup is drawn on top." and
  "Up to 5 minutes. Works offline." answer a tech's two real worries in one line each.

## What works

- **Markup legible on any photo.** Against the black outline: red `#FF3B30` 5.92:1, yellow
  `#FFD60A` 14.88:1, white 21:1. Without the outline, yellow on a white deck would be 1.41:1 and
  red on pool blue `#1F6FAE` 1.5:1, so the outline earns its place.
- **Color is never the only signal.** Swatches have names for VoiceOver, the selected swatch
  gets a navy ring and grows, and every swatch has a 44 pt hit area.
- **Segmented control** for the three tools, per the house rule.
- **Permission strings** are active sentences that say how and why, matching the ✓ example in
  `privacy.md`. `photosPermission: false`: the app asks only for what it uses. The camera prompt
  comes at the first tap of Photo, in context.
- **Upload state in words everywhere:** thumbnail labels ("Photo, 0:12, waiting to upload"), the
  Upload detail, the sync bar, and a sign-out warning that counts unsent photos and recordings.
- **System video player** (`nativeControls`), shown at the clip's own aspect ratio
  (`playing-video.md › Best practices`).
- **Contrast:** white duration text and the play icon on navy 15.4:1; muted 15 pt `#5A6875` on
  concrete `#E9ECEF` 4.82:1 and on white 5.72:1; danger red on white 5.46:1. Timers use tabular
  numbers.
- **Delete** uses the danger style and a destructive alert button, never the primary style.

## Kept deliberately

- **Fixed markup colors.** `color.md › System colors` says not to hard-code system color values.
  Markup is content, not chrome: it must match on the phone, the office view and the PDF report,
  so fixed hex values are correct here.
- **Red recording frame.** It reuses the fail red, which `color.md` would normally flag (one color,
  one meaning). Red-means-recording is a universal convention, and the word "Recording" carries the
  state anyway.
- **Light only.** Carried over from the M4 review: dark screens wash out in sun.

## Status of fixes

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Critical | Markup editor controls out of reach for portrait photos | Fixed: editor is full-screen; Cancel and Save in the header, tools in a fixed bottom bar, photo fitted between them |
| 2 | High | Leaving the markup editor discards work silently; Clear All not undoable | Fixed: undo history (Undo restores Clear All); Cancel with changes asks to discard; back button and swipe are off while editing |
| 3 | High | Drawing is drag-only; a tap does nothing | Fixed: a tap places a default arrow or circle (`shapeAtTap` in core, tested); hint updated |
| 4 | Medium | "Offline" message shown while loading | Fixed: `useMediaSource` reports loading / unavailable; spinner while loading, Try Again when unavailable |
| 5 | Medium | Permission-denied alerts have no Open Settings | Fixed: camera and microphone alerts offer Open Settings |
| 6 | Medium | Camera and location prompts stacked | Fixed: location permission is asked and answered before the camera opens |
| 7 | Medium | Voice note Cancel discards without confirmation; unmount drops recording | Fixed: Cancel renamed Discard, confirms after 5 s; leaving mid-recording saves it |
| 8 | Medium | Delete alert cancel titled "Keep" | Fixed: "Cancel" |
| 9 | Medium | Alert used for empty text label | Fixed: inline error on the Label field |
| 10 | Medium | Audio playback: no seek bar; silent-mode playback | Partly fixed: plays in silent mode. Seek bar deferred (voice notes are short; revisit with M7 report playback) |
| 11 | Medium | No photo zoom | Fixed: pinch to zoom on the viewer (iOS) |
| 12 | Medium | Orange editing border | Fixed: the editor uses a full-screen navy canvas; no orange border |
| 13 | Medium | Sync bar truncation, 14 pt, 36 pt target | Fixed: two lines, 15 pt, 44 pt tall |
| 14 | Medium | Inconsistent names for captures | Fixed: "photos" or "photos and recordings"; viewer names the kind |
| 15 | Medium | Capture buttons crowd at large text sizes | Fixed: buttons stack at large text sizes |
