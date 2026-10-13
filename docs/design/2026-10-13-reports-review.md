# Design review: LeakBook reports and signatures (M7)

Reviewed with the Apple Design skill (Apple Human Interface Guidelines, pinned to upstream commit
`904b0ee`). References opened: `accessibility.md`, `layout.md`, `typography.md`, `color.md`,
`designing-for-ios.md`, `cross-platform.md`, `entering-data.md`, `text-fields.md`, `buttons.md`,
`feedback.md`, `generative-ai.md`, `writing.md`, `segmented-controls.md`, `printing.md`.

Screens: the phone's Report tab (`apps/mobile/src/features/report/ReportTab.tsx`), the signature
screen (`apps/mobile/src/app/(app)/jobs/[id]/signature.tsx`, `ui/SignaturePad.tsx`), the office
report panel (`apps/web/src/components/report-panel.tsx`), and the customer report page, which is
also printed to PDF (`apps/web/src/components/report-view.tsx`, `app/r/[token]/page.tsx`,
`app/globals.css`). Platform: iPhone first, React Native (Expo), and a Next.js website. On the
website the HIG principles and foundations apply (accessibility, color, typography, layout,
writing), and the component guidance applies too, but the macOS window and menu bar rules do not.
Artifact: source code only, with no screenshots and no device. Contrast is computed from the hex
values in `brand/tokens.json` (WCAG 2). Heights are computed from the styles for a 375 by 667 pt
iPhone SE (603 pt under the navigation bar) and a 393 by 852 pt iPhone (about 715 pt).

## Summary

These screens turn a day's evidence into a document a homeowner can trust: the tech gets a
signature, reviews the AI draft, and sends a fixed version by email or text. The customer then
opens a page in the shop's colors that prints cleanly. The thesis holds: one orange action per
state, versions that lock on send, a "check these before sending" list, and the shop's brand on
the customer page with LeakBook only in the footer. Rating before fixes: **Critical issues**. The
signature screen doesn't scroll, so Save Signature is off screen on an iPhone SE and on standard
iPhones once the keyboard or an error appears. Two High problems lose report edits without
warning, on both the phone and the website: writing the draft again replaces it, and on the
website sending ignores unsaved text.

## Critical

- **Critical: Save Signature can be out of reach.** `signature.tsx:89` renders
  `<Screen scroll={false}>` so that a drag on the pad draws. The content is padding 16, purpose
  chips 123 (four purposes wrap to two rows of 48), name 71, role 71, the pad block 305 (label,
  220 pt pad, Clear), Save 52, four 16 pt gaps and 48 pt of bottom padding: about 750 pt. On an
  iPhone SE that leaves 603 pt, so Save is about 150 pt below the screen and can't be reached.
  On a 393 pt iPhone (715 pt) it overflows once the error notice shows. With the keyboard up for
  the name field, `KeyboardAvoidingView` squeezes a view that can't scroll.
  `designing-for-ios.md › Best practices`: it is easier to reach "a control when it's located in
  the middle or bottom area of the display". `layout.md › Adaptability`: "Be prepared for
  text-size changes."
  **Fix:** let the screen scroll, and stop scrolling only while a finger is on the pad. Add
  `scrollEnabled` to `Screen` (passed to its `ScrollView`). Add `onDrawing(drawing)` to
  `SignaturePad` and call it on responder grant, release and terminate.
  `signature.tsx`: `<Screen scrollEnabled={!drawing}>` with `onDrawing={setDrawing}`.

## Improvements

- **High: "Write the Draft Again" throws away edits without asking.** Phone
  (`ReportTab.tsx:153-159`) and web (`report-panel.tsx:68-83`) both call the draft writer, and
  `save_report_draft` overwrites `final_sections`. Any wording the tech or office fixed is lost
  in one tap. `feedback.md › Best practices`: "Warn people when they initiate a task that can
  cause data loss that's unexpected and irreversible." `generative-ai.md › Outputs`: "Make it
  easy for people to refine or revert generated results".
  **Fix:** when a draft has text, ask first. Phone:
  `Alert.alert("Write the draft again?", "The new draft replaces this one, including your edits.", [{ text: "Cancel", style: "cancel" }, { text: "Write Again", style: "destructive", … }])`.
  Web: the same question in `window.confirm` from the form's `onSubmit` (as the settings forms do).
- **High: on the website, sending ignores text that hasn't been saved.** The textareas and the
  send buttons were in separate forms (`report-panel.tsx:102-176`). If someone edits a section
  and clicks Send by Email, the old text is locked and sent, and the edit is lost when the page
  revalidates. The only warning was "Save your edits first" in 15 pt muted text. The phone
  already saves pending edits before it sends. `feedback.md › Best practices` (quoted above).
  `entering-data.md › Best practices`: "Dynamically validate field values."
  **Fix:** put the sections and the send controls in one form. Save Text uses
  `formAction={saveAction}` and the send buttons use `formAction={sendAction}`. In
  `sendReportAction`, save the posted sections (`saveReportText`) before `sendReport`. New copy:
  "Sending saves your edits and locks this version…".
- **High: phone send errors appear off screen.** One error `Notice` sits under the Write Draft
  button (`ReportTab.tsx:161`), above every section field. A tech who taps Send by Email at the
  bottom never sees "Enter the customer's email." or "Your edits haven't reached the server
  yet." `writing.md › Best practices`: "display it as close to the problem as possible".
  `feedback.md › Best practices`: "Show people when a command can't be carried out and help them
  understand why."
  **Fix:** record where the error came from (`{ at: "draft" | "send", text }`). Draft errors stay
  under the Write Draft button, and send errors show inside the Send card under the buttons.
- **Medium: the AI isn't disclosed.** The web hint said "Written from this job's checklist,
  tests, and findings. You approve every word." without naming AI. The phone said nothing.
  `generative-ai.md › Transparency`: "Communicate where your app uses AI." `generative-ai.md ›
  Inputs`: "clearly communicate that AI-generated content may contain errors."
  **Fix:** web, when AI is set up: "AI writes the draft from this job's checklist, tests, and
  findings. It can get details wrong, so read every word before sending." Phone: under the
  button, when the draft's `model` isn't the plain writer (`leakbook-plain`): "AI wrote this
  draft from the job's checklist, tests, and findings. It can get details wrong, so read every
  word before sending."
- **Medium: switching Homeowner/Partner on the phone drops the field being typed in.** Edits are
  saved on blur. The screen's `ScrollView` uses `keyboardShouldPersistTaps="handled"`, so tapping
  a segment doesn't blur the field, and `setEdits({})` (`ReportTab.tsx:140`) throws the edit
  away. Separately, saving several edits in a loop (`ReportTab.tsx:88`) wrote each one from the
  original sections, so the last write could undo the earlier ones. `feedback.md › Best
  practices` (quoted above).
  **Fix:** one `saveEdits()` that applies every pending edit in a single write. Use it on blur,
  before sending, and before the template switches.
- **Medium: the office "Sent" links are small and named the same.** "Report" and "PDF" are
  inline 15 px links about 20 px tall (`report-panel.tsx:207-223`), and so is "View sent version
  N". Every version repeats "Report" and "PDF", so a screen reader's link list can't tell them
  apart. House rule: 44 pt targets. `buttons.md › Best practices`: "a hit region of at least
  44x44 pt". `writing.md › Best practices`: use "more descriptive words or phrases" for links.
  **Fix:** `inline-flex min-h-11 items-center` on the three links, and
  `aria-label="Version N report"` / `"Version N PDF"`. Phone: `accessibilityLabel="View version N"`
  on the View link.
- **Medium: the "text the customer" box says Copy Link but copies a message.** `CopyLink` labels
  its button "Copy Link" (`settings-forms.tsx:174`), but here it holds the whole message.
  `writing.md › Best practices`: "Be action oriented." **Fix:** a `button` prop on `CopyLink`,
  set to "Copy Message" here.
- **Medium: the shop header text is dimmed below contrast.** The header picks navy or white,
  whichever contrasts more with the shop's color (`textOnBrand`). For a mid-tone shop color the
  best of the two can be as low as 3.9:1. The contact line and date at 15 px add `opacity-90` on
  top (`report-view.tsx:100, 107`), which lowers it further. `accessibility.md › Vision`: text
  up to 17 pt needs 4.5:1. **Fix:** remove `opacity-90`. The 3.9:1 floor for mid-tone shop
  colors remains. The office branding preview already shows the contrast numbers.
- **Medium: the customer report has no `h1`.** The company name and the title "Leak Detection
  Report" were `<p>` elements, and the first heading was the section `h2` "Summary". Screen
  reader users navigating by heading start in the middle. `accessibility.md › Vision`: "Describe
  your app's interface and content for VoiceOver." **Fix:** make the report title an `h1`. The
  office panel's "Send version N" and "Sent" are now `h4` under the panel's `h3`.
- **Low: the test table can overflow on a phone.** The four-column table sits directly in a
  343 pt column (`report-view.tsx:214`), and customers usually open the link from a text message.
  `layout.md › Adaptability`: "Design a layout that adapts gracefully". **Fix:** wrap it in
  `overflow-x-auto`, so a long reading scrolls inside the table instead of widening the page.
- **Low: "Send Version N" is in Title Case on the phone.** It is a card heading, which is
  sentence case under the house rules, and the website writes "Send version N". `writing.md ›
  Best practices`: "Choose a style for each UI element type and use it consistently". **Fix:**
  "Send version N".
- **Low: the purpose chips are labeled only "For".** **Fix:** "Signature for".
- **Low: leaving the signature screen after signing discards the ink without asking.**
  `feedback.md › Best practices` (quoted above). The cost is a re-sign, but the customer may
  have walked away. **Fix (not applied):** while strokes exist, turn off `gestureEnabled` and
  confirm on back with "Discard this signature?" (Cancel / Discard). That needs
  `@react-navigation/native`'s `usePreventRemove`, which the app doesn't depend on directly yet.
- **Low: the signature pad can't be used with VoiceOver.** The pad is one accessible element
  ("Signature box. Sign with your finger."). VoiceOver users would need direct touch
  (`UIAccessibilityTraitAllowsDirectInteraction`), which React Native's accessibility props
  don't expose. In practice the customer signs, not the tech; this would need a native module.
- **Low: the customer report's line length.** At 1280 px, the 896 px column at 17 px gives
  lines of about 100 characters in the Findings and Next steps text. This is my judgment, not a
  cited guideline: about 70 characters (`max-w-prose` on `Paragraphs`) reads better. The
  printed page is narrower anyway.
- **Low: the superseded banner uses `text-water` / `text-navy`, not the role tokens.** The page
  is always `lb-light`, so they resolve to the same values. Use `text-link` / `text-text` when
  the page is next touched.

## Craft notes

- **Signature element:** the customer page's header band in the shop's own color, with numbered
  severity badges that match the pins on the pool diagram. It looks like the shop's document, not
  LeakBook's, which is correct for a white-label report.
- **Restraint:** one orange action per state on both platforms (Write Draft, then Send by Email;
  Save Signature). The office page can show two orange Send by Email buttons when both templates
  have drafts, one per panel. That is within `buttons.md › Style` ("one or two per view").
- **Trustworthy copy:** "Sending locks this version. Changes after that go out as a new
  version." and the "Check these before sending" list set the right expectations for an AI draft.

## What works

- **Contrast:** body and pad ink navy `#12263A` on white 15.4:1; muted 15 pt `#5A6875` on white
  5.72:1; links `#1F6FAE` 5.33:1; "Saved." pass green `#1B7D45` 5.16:1. The pad outline and
  signature line use `controlBorder` (5.72:1, above the 3:1 needed for non-text).
- **Severity never by color alone:** each finding shows a number badge, the severity name, and
  the component.
- **Segmented control** for Homeowner/Partner (two related views); **Choice** for the four long
  signature purposes, which would truncate in segments (`segmented-controls.md › Best practices`).
- **Signatures stored as vectors** and saved offline first, with the place recorded.
- **Print:** `print-color-adjust: exact` keeps the shop's colors, the Download PDF bar is
  `print:hidden`, and blocks avoid page breaks inside them. The PDF is offered in a standard,
  visible place (`printing.md › Best practices`: "Make printing discoverable").
- **Validation in words** near the Save button on the signature screen ("Ask them to sign in the
  box.").

## Kept deliberately

- **The customer page is always light** (`lb-light`). It is a document that gets printed, as in
  the office review.
- **The shop's brand colors are not tokens.** They are content chosen by the shop.
- **`Choice`, not `Segmented`, for signature purposes.** Four options with long labels; see above.

## Status of fixes

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Critical | Signature screen doesn't scroll; Save out of reach | Fixed: screen scrolls; scrolling stops only while a finger is on the pad (`Screen scrollEnabled`, `SignaturePad onDrawing`) |
| 2 | High | Write the Draft Again replaces edits without asking (phone and web) | Fixed: native alert on the phone, `window.confirm` on the web, only when a draft has text |
| 3 | High | Web send ignores unsaved text | Fixed: one form; Send saves the posted sections before sending; copy updated |
| 4 | High | Phone send errors appear off screen | Fixed: send errors show in the Send card; draft errors under Write Draft |
| 5 | Medium | AI not disclosed | Fixed: web hint and phone note name AI and say it can get details wrong |
| 6 | Medium | Template switch drops the field being typed in; looped saves overwrite each other | Fixed: `saveEdits()` writes all edits at once, on blur, before send and before switching |
| 7 | Medium | Small, identically named Sent links | Fixed: 44 px links with version-specific labels (web); labeled View link (phone) |
| 8 | Medium | "Copy Link" copies a message | Fixed: "Copy Message" |
| 9 | Medium | Header text dimmed with `opacity-90` on the shop color | Partly fixed: opacity removed; mid-tone shop colors can still be 3.9:1, shown in the branding preview |
| 10 | Medium | No `h1` on the customer report | Fixed: title is `h1`; panel subheads are `h4` |
| 11 | Low | Test table overflows on phones | Fixed: `overflow-x-auto` wrapper |
| 12 | Low | "Send Version" in Title Case | Fixed: "Send version" |
| 13 | Low | Purpose label "For" | Fixed: "Signature for" |
| 14 | Low | Back discards ink without asking | Not fixed: needs a direct `@react-navigation/native` dependency; re-signing is cheap |
| 15 | Low | Pad unusable with VoiceOver | Not fixed: React Native doesn't expose direct interaction; the customer signs |
| 16 | Low | Long line length on the customer page | Not fixed: judgment call, left for the owner |
| 17 | Low | Banner uses brand colors instead of role tokens | Not fixed: same values on an always-light page |
