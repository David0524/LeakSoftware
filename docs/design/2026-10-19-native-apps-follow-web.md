# Native apps follow the phone website (design spec, 2026-10-19)

Owner, 2026-10-19: "The mobile web app is beautiful. Please base the Swift build around that. ...
Do the same for the expo app, because we're going to have to push to Google Play too."

Both native apps, the Swift iPhone app (`apps/ios`) and the Expo app (`apps/mobile`, which is the
Android app and the iPhone app until the Swift switch-over), are rebuilt to look and navigate like
the website (`apps/web`) does at phone width. This document is what they are built from. It
describes the website as it renders on an iPhone (393 x 852 pt), checked against screenshots of the
live site signed in as the demo tech and the demo owner, and against the website's code. A developer
should be able to build every screen from this file without opening the website.

Where the website does something only a browser needs, or has a small bug, this spec says what the
apps do instead (section 9). Everything else is copied: layout, sizes, colors, wording, order.

Contents:

1. Decisions made in this spec (for the owner to confirm)
2. Foundations: type, color, shape, spacing, materials, targets, motion
3. Components
4. Navigation and roles
5. Screens
6. Sheets and editors
7. Mapping to the existing Swift and Expo code
8. Platform notes
9. What the apps must not copy from the website
10. Open questions

---

## 1. Decisions made in this spec (for the owner to confirm)

These were ambiguous. Each is resolved the way listed; the owner can change any of them.

1. **One tab bar for everyone: Today, Jobs, Schedule, Messages, More**, the website's phone tabs.
   The Expo app today opens on Jobs with no tab bar, and puts Messages under Settings. Both apps
   now open on Today.
2. **Android looks like the website too.** CLAUDE.md and the 2026-10-14 decision say the Android
   build "keeps its own look" (navy app bar, floating New Job button, Material dialogs). The owner's
   new instruction is to base the Expo app on the website "because we're going to have to push to
   Google Play too", and the website already looks exactly like this in Chrome on an Android phone.
   So the Expo app uses this spec on both platforms. Android keeps only what the system owns: the
   back gesture and button, ripple feedback, Public Sans as the body face, and the system date and
   time pickers (section 8.3). CLAUDE.md's "Android keeps its own look" line and DECISIONS.md need
   updating once the owner confirms.
3. **New Job is a pushed screen, not a sheet**, as on the website ("‹ Jobs", large title "New
   Job", Create Job at the bottom). Both apps currently open it as a sheet. Leaving with unsaved
   entries asks first (action sheet "Discard this new job?" / Discard Job).
4. **The job page has the website's five sections**, Details, Checklist, Findings, Photos, Wrap-Up
   (four on a maintenance visit: no Findings). Today the Swift app has Checklist, Tests, Findings,
   Report, Quote and the Expo app the same; Tests and Findings merge into Findings, Report and Quote
   (and the invoice) move into Wrap-Up, and photos get their own section.
5. **Section labels over grouped lists are Barlow Semi Condensed SemiBold**, 13 pt, uppercase. The
   website's code asks for the body face, but its global `h1, h2, h3` rule wins, so what the owner
   sees (and likes) is Barlow. The apps copy what renders.
6. **Sheet titles and the small (collapsed) navigation title use the body face** (San Francisco on
   iPhone, Public Sans on Android), semibold 17. On the website the collapsed bar title is already
   the body face; sheet titles render in Barlow only through the same CSS rule as item 5. Using one
   face for every bar title is the iOS convention and keeps sheets matching the bar.
7. **The tab bar is the system's on iOS (Swift)**: on iOS 26 and later a native `TabView` already
   is the floating Liquid Glass bar the website imitates. On iOS 18 to 25 the system bar is the
   classic full-width one; that is accepted rather than drawing our own. The Expo app draws the
   website's floating bar itself, on both platforms (section 8.2), since its iPhone build is
   temporary.
8. **Our own segmented control, not the system one**, in both apps, so it is 44 pt tall (house
   rule; `UISegmentedControl` is 32 pt before iOS 26) and identical on iOS 18, iOS 26 and Android.
9. **Selected filter pills are `primary` with `onPrimary` text.** In light mode that is the same
   blue the website shows (`link` and `primary` are both `#1A63A0`). The website uses `link` with
   white text, which in dark mode is light blue on white (about 2.4:1); the apps fix that.
10. **"Attention" is warning-colored in a checklist group's summary.** The website shows "1
    attention" in green (it only checks for leaks); green should mean all clear.
11. **The sync bar stays**, though the website has none: the apps are offline-first and techs must
    see unsent work. It sits under the large title on Today and Jobs, and on the job page
    (section 3.17).
12. **(Replaced 2026-10-20: the Dashboard is in both apps, first in More, for owners and admins.)** **Dashboard is left out of the apps' More.** It is a computer page (charts and tables). Owners
    and admins open it on the website. Sundeck Pro Billing is left out of the apps' Settings for
    App Store and Google Play payment rules (section 8.4).
13. **Messages' New Message is an icon in the navigation bar** (compose icon, right side), like New
    Job's "+", instead of the filled button under the title. It only shows when the company number
    is working, as on the website.
14. **A photo opens a full-screen viewer** in the apps. The website shows photos as cards in the
    Photos section only. The card layout stays the same; tapping the photo opens the viewer
    (section 6.5), which the Swift app already has (`MediaScreen`).

---

## 2. Foundations

All values are in points (pt) on iOS and density-independent pixels (dp) on Android, which are the
same number. Colors are named by token; every hex below comes from `brand/tokens.json`
(`color.role.light` / `color.role.dark`) or the CSS variables generated from it
(`packages/tokens/tokens.css`). The apps read the generated token files (`SundeckTokens` in Swift,
`@leakbook/tokens` in Expo); they never type a hex value.

### 2.1 Type

Two faces, both bundled (they work offline):

- **Display: Barlow Semi Condensed**, weights SemiBold 600, Bold 700, ExtraBold 800
  (`brand/fonts/BarlowSemiCondensed-*.ttf`). Swift registers them with `BrandFonts.register()`;
  Expo loads them as `Barlow-SemiBold`, `Barlow-Bold`, `Barlow-ExtraBold`.
- **Body: the system font on iPhone (San Francisco), Public Sans on Android.** This is exactly
  what the website does: its body stack is `-apple-system, BlinkMacSystemFont, Public Sans, ...`,
  so Safari shows San Francisco and Android Chrome shows the bundled Public Sans. Expo already has
  `face` in `ui/theme.ts` for this.

There is no 400 weight of Barlow. Anything set in Barlow is at least SemiBold.

The phone type scale. Sizes are the website's `rem` values at the default 16 px root, so
`1.0625rem` = 17. "Line" is line height.

| Role (name in code) | Face, weight | Size / line | Where |
|---|---|---|---|
| `largeTitle` | Barlow ExtraBold | 34 / 42 | Every screen's large title ("Today", "Job #1040") |
| `sectionHeading` | Barlow Bold | 24 / 32 | Headings inside a screen: "Checklist", "Tests", "Findings", "Photos and Recordings", "Report and Sign-Off", "Signatures", "Quotes", "Invoice" |
| `cardTitle` | Barlow Bold | 20 / 28 | A card's title: "Homeowner report", "Quote #1006 · Accepted", "Getting Started", "Needs a Time (27)", a route's tech name, "Pool", "Readings", "What to Add" |
| `subHeading` | Barlow Bold | 18 / 28 | A heading inside a card: "Add From Findings", "Lines", "Add a Line", "Details", "Send"; Schedule › Week's day headings ("Monday, October 12") |
| `sectionLabel` | Barlow SemiBold, UPPERCASE | 13 / 18 | The label over a grouped list: "CUSTOMER", "YOUR ACCOUNT", "ON THIS DEVICE". Color `textMuted`, no extra letter spacing |
| `navTitle` | Body, semibold | 17 / 22 | The small centered title in the navigation bar once the large title has scrolled under it; sheet titles |
| `body` | Body, regular | 17 / 25.5 | All running text, row labels, field text, button text (semibold) |
| `bodyEmphasis` | Body, semibold | 17 / 25.5 | A row's main name (customer, test name, finding title) |
| `bodyMedium` | Body, medium | 17 / 25.5 | Field labels above fields, checklist item names, filter pill text |
| `secondary` | Body, regular | 15 / 22.5 | Detail lines under a row, hints under fields, tip messages, notes. Usually `textMuted` |
| `footnote` | Body, regular | 13 / 18 | Status chips (semibold), the footer under a grouped list, day separators in a conversation, sub-lines of checklist items, segmented controls in the job's section switcher (medium; semibold when chosen) |
| `tabLabel` | Body, medium | 11 / 13 | Tab bar labels |
| `segment` | Body, medium (semibold when chosen) | 15 / 20 | Segmented controls |

Display numerals (Barlow, tabular):

- Schedule › Day week strip: day number Barlow Bold 20; weekday above it body medium 13.
- Today stop: stop number Barlow Bold 17 in a 32 pt circle; the stop's time Barlow Bold 17.
- Schedule › Month: day number Barlow Bold 18.
- Chemical Calculator dose amount: Barlow ExtraBold 24, line 1.25.
- Finding number in its severity circle: body bold 15 (not Barlow).

Rules:

- **Numbers are tabular** wherever they line up or change: money, PSI, gallons, readings, minutes,
  counts in badges (`font-variant-numeric: tabular-nums` on the web; `.monospacedDigit()` in
  SwiftUI; `fontVariant: ["tabular-nums"]` in React Native).
- **Dynamic Type / font scale:** the website is in `rem`, so the browser's text size scales
  everything together. The apps scale every role with the system setting: Swift with
  `UIFontMetrics` (body roles relative to `.body`, `largeTitle` to `.largeTitle`, `footnote` and
  `sectionLabel` to `.footnote`, `tabLabel` left to the system tab bar); Expo with `allowFontScaling`
  and `maxFontSizeMultiplier` 2.4 (M11 decision: "app text scales up to 2.4x").
- **Capitalization:** Title Case for screen titles, buttons, segment labels and alert buttons;
  sentence case for everything else (`brand/BRAND.md`). Section labels are uppercase by style, not
  in the copy: the copy is "Your account", drawn uppercase.

### 2.2 Color

The default is **Light**, whatever the phone's setting, as on the website (`lib/theme.ts` turns
dark on only when chosen) and as the field app has always been (`brand/BRAND.md`: dark screens
wash out in direct sun). More › On This Device › Appearance switches Light | Dark. (The dark
screenshots of the live site came out light for this reason; dark values below come from the
tokens.)

Role tokens:

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F2F2F7` | `#0E141A` | Page background (the iOS grouped gray) |
| `surface` | `#FFFFFF` | `#161E26` | Cards, grouped lists, fields, sheets' content blocks |
| `text` | `#12263A` | `#E6ECF1` | Primary text, large titles |
| `textMuted` | `#5A6875` | `#93A2AF` | Secondary text, section labels, inactive tab items |
| `border` | `#D3D9DF` | `#2A3540` | Table borders (rare on phones) |
| `primary` | `#1A63A0` | `#2B78B8` | Filled buttons, selected filter pill, outgoing text bubbles, tab badges |
| `onPrimary` | `#FFFFFF` | `#FFFFFF` | Text on `primary` |
| `link` | `#1A63A0` | `#6AAEE6` | Links, back button, "+" and other bar buttons, tinted buttons' text, selected tab, address links |
| `focus` | `#1A63A0` | `#6AAEE6` | Focus ring |
| `controlBorder` | `#5A6875` | `#8A97A4` | 1 pt outline of fields, selects, and unselected round checks |
| `fill` | `#7676801F` | `#7676803D` | Segmented control track, unselected filter pills, the off switch, incoming text bubbles, "To Do" verdict pill |
| `separator` | `#3C3C434A` | `#545458A6` | 0.5 pt hairlines in lists and bars |
| `placeholder` | `#3C3C434C` | `#EBEBF54C` | Placeholder text in fields |
| `thumb` | `#FFFFFF` | `#636366` | The raised thumb of a segmented control |
| `diagramWater` | `#CFE3F3` | `#1F3A52` | Pool fill in the pool diagram and shape picker |
| `onStatus` | `#FFFFFF` | `#12263A` | Text on a solid status chip or verdict pill |
| `header` / `onHeader` | `#12263A` / `#FFFFFF` | `#0B1622` / `#FFFFFF` | Not used in the apps' chrome any more (the navy bar is gone, decision 2). Kept for the signature and review screens' document headers, which follow the shop's brand |

Status colors (fixed, never rebranded; `brand/BRAND.md`):

| Token | Light | Dark |
|---|---|---|
| `pass` | `#1B7D45` | `#3FB36F` |
| `fail` | `#C62F2B` | `#E5655F` |
| `warning` | `#8A5A0E` | `#D9A040` |
| `excluded` | `#5B6B7A` | `#8E9DAB` |
| `info` | `#1F6FAE` | `#6AAEE6` |

Brand colors used directly: `water` `#1F6FAE` (pool outline in the diagram), `safety` `#EE6A1F`
(logo dot only; nowhere in app chrome), `navy` (app icon, video letterbox background).

Tints (a token at an opacity, over whatever is behind):

| Name | Value | Use |
|---|---|---|
| `tinted` | `link` at 12% | Secondary button background |
| `tintedPressed` | `link` at 24% | Secondary button pressed |
| `iconTint` | `link` at 10% | Round icon buttons, the Photos section's capture tiles |
| `dangerTint` | `fail` at 12% | Danger button background (pressed 24%) |
| `rowPressed` | `text` at 6% | A tapped row |
| `well` | `text` at 4% over `surface` | A group inside a card (a schedule stop, a quote line, a Needs a Time card) |
| `emptyFill` | `text` at 4% over `bg` | Empty-state blocks |
| `noticeFill` | the notice's tone at 10% | Notice background |
| `accessFill` | `warning` at 10% | A pool's access notes on Today |
| `scrim` | black at 40% | Behind sheets and action sheets |

### 2.3 Shape

| Radius | Value | Use |
|---|---|---|
| Field | 10 | Text fields, selects, text areas, the date button on Schedule |
| Grouped list | 12 | Inset grouped lists (`.grouped`). Swift's `List(.insetGrouped)` may keep the system radius (10 on iOS 18, larger on iOS 26); our own grouped blocks use 12 |
| Action sheet group | 14 | Action sheet panels |
| Notice, empty state, well, capture tile, schedule stop | 16 | |
| Card | 20 | `.card`: tips, Getting Started, report/quote/invoice panels, route cards, chemical cards, Today's stops |
| Sheet top corners | 20 | |
| Conversation bubble | 20 | |
| Composer field | 22 | |
| Segmented track | 24 (with 2 pt padding, so the thumb reads as a capsule) | |
| Tab bar | 28 (capsule at its 58 pt height) | Expo's drawn bar; the Swift app uses the system bar |
| Pill | full (capsule) | Buttons, filter pills, status chips, verdict pills, badges, round icon buttons |

Corners are continuous (`RoundedRectangle(cornerRadius:style: .continuous)` in SwiftUI).

### 2.4 Spacing

From `tokens.space`: 4, 8, 12, 16, 24, 32, 48.

- **Page margins: 16** left and right. Content does not touch the screen edge, except sideways
  scrolling rows (filter pills, "whose day" pills, Needs a Time), which run to the edge and start
  16 in.
- Below the navigation bar: the large title starts right under the 44 pt bar (plus the safe area).
- Large title block: subtitle 4 below the title; 16 below the block to the first content. Content
  under the title on the job page: the section switcher starts 16 lower.
- Between grouped lists and cards on a screen: **24**. Between a section label and its group: 8.
  Between a group and its footer: 8 (footer inset 16).
- Inside a card: 20 padding (tips: 12 top and bottom, 16 left, 4 right, so the close button sits in
  the corner).
- Inside a list row: 16 left and right, 10 top and bottom, 12 between icon, text, value and chevron.
- Form fields: 16 between fields; 4 between a label and its field; 4 between a field and its hint.
- Pills in a row: 8 apart. Buttons in a row: 12 apart.
- Bottom of every tab screen: **128** of empty space so the last row clears the floating tab bar
  (Swift: the system handles this with the tab bar's safe area; Expo: `paddingBottom` 128 on
  the scroll content).

### 2.5 Elevation, materials, hairlines

- **Cards** (`.card`, light mode only): two soft shadows, `0 1 2` navy (`#12263A`) at 6% and
  `0 6 20` navy at 5%. **No shadow in dark mode.** No outline. With Increase Contrast: no shadow,
  a 1 pt `controlBorder` outline. SwiftUI: two `.shadow(color:radius:x:y:)` (radius is half the
  CSS blur: 1 and 10). React Native: iOS `shadowColor/Opacity/Radius/Offset` for the larger one;
  Android `elevation` 1 plus the same colors where supported (`boxShadow` on the New Architecture).
- **Grouped lists, wells, notices, empty states:** flat, no shadow.
- **Hairlines:** 0.5 pt `separator`. In a grouped list a hairline starts 16 from the left (where the
  text starts; 60 for findings, after the number circle) and runs to the right edge.
- **Glass**, only on the floating layer: the tab bar, the navigation bar once content scrolls
  under it, the job's section switcher once pinned, the Chemical Calculator's What to Add bar,
  and action sheet panels. Content never sits on glass.
  - Website recipe: `surface` at 72% with a 24 pt blur and 1.4 saturation, a 1 pt border of `text`
    at 10%, shadow `0 8 28` navy at 14% plus a 1 pt inner top highlight of white at 55% (dark:
    shadow black at 45%, highlight white at 8%). The navigation bar and pinned switcher use the
    "bar" variant: `bg` at 88% with a 24 pt blur and a 0.5 pt `separator` line along the bottom.
  - Swift: use the system. iOS 26 bars and tab bar are Liquid Glass already; on iOS 18 to 25
    `.bar` / `.regularMaterial` is the bar material. For our own floating things (the section
    switcher, the What to Add bar) use `.glassEffect()` on iOS 26 and `.regularMaterial` before it.
  - Expo: `expo-blur` `BlurView` (intensity about 60, tint `systemMaterial` / `systemMaterialDark`
    on iOS) under a `surface` overlay at 72%. On Android, no blur: `surface` at 96% opacity, the 1 pt
    border, and elevation 8. (Add with `npx expo install expo-blur`.)
  - Reduce Transparency or Increase Contrast: solid `surface` (bars: solid `bg`), border
    `controlBorder`.

### 2.6 Tap targets

Every tappable thing is at least **44 x 44**, as on the website (CLAUDE.md house rule). The brand's
48 (`tokens.touch.minTarget`, gloves and wet hands) applies to the main field actions where there
is room: full-width buttons in sheets and forms, the verdict pills (44 high but full row width
available), capture tiles (56 high). Small text links ("Turn Off", "Show 29 More", "Hide") get
their 44 from padding, not from size.

### 2.7 Motion and haptics

- Sheets slide up over 0.28 s (`cubic-bezier(0.32, 0.72, 0, 1)`, the iOS curve); the scrim fades
  over 0.2 s. Use the platform's own sheet animation where the platform draws the sheet.
- The segmented thumb slides to the chosen segment (Swift: `matchedGeometryEffect`; Expo:
  Reanimated layout transition), 0.2 s.
- A checklist group's chevron rotates 90 degrees when it opens.
- The large title hands off to the small bar title as it scrolls under the bar (system behavior).
- Reduce Motion: no slides; changes are instant.
- Haptics (existing decision, 2026-10-14): segment change (selection), save (success), confirmed
  destructive action (warning), pull to refresh, full swipe on a row. Not on every tap.

---

## 3. Components

Each component lists its look, its behavior, and how to build it in each app. "Web:" points to the
source when a developer wants to double-check.

### 3.1 Navigation bar and large title

Web: `components/nav-bar.tsx`, `PageHeader` in `components/ui.tsx`.

Look, top to bottom:

1. **The bar**, 44 tall under the status bar. Three slots:
   - Left: **Back**, a chevron (12 x 20, 2.6 stroke, rounded) and the previous screen's name in
     `link`, body 17 regular, 2 apart: "‹ Jobs", "‹ More", "‹ Settings", "‹ Messages",
     "‹ Customers". 44 tall. Absent on tab roots.
   - Middle: the **small title** (`navTitle`, centered, truncated, at most 55% of the width). Hidden
     while the large title is on screen; fades in as it scrolls under the bar.
   - Right: the screen's **main action**, a 44 pt round button with no fill: "+" (24 pt, 2.2 stroke,
     `link`) for New Job, New Item in a settings list; the compose icon for New Message. Pressed:
     `link` at 10% behind it.
   - Background: transparent while at the top (the page's `bg` shows through); once content
     scrolls under it, the bar material (2.5) with a 0.5 hairline at its bottom.
2. **The large title** in the content, 16 from the left: `largeTitle`, `text` color.
3. **The subtitle**, optional, 4 below: body 17, `textMuted`. It can hold inline content (Today's
   date and weather; the job's status chip, type and date; Schedule's date and "· Today" link).
4. **Header actions**, optional, under the subtitle: a row of buttons (Today's "Open Route in
   Google Maps"; the job's "Start Job"; a conversation's "Mark as Unread" and call button;
   Invoices' "Export Invoices" and "Export Payments" for managers; the customer's contact buttons).

Build:

- Swift: `NavigationStack` with `.navigationTitle` and `.navigationBarTitleDisplayMode(.large)`.
  Set the large title font once at launch:
  `UINavigationBar.appearance().largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle:
  .largeTitle).scaledFont(for: Barlow ExtraBold 34), .foregroundColor: text]` and the inline title
  to the system semibold 17 in `text`. Tint the bar buttons `link`. The subtitle and header actions
  are the first rows of the content (not `navigationSubtitle`, which needs iOS 26), with no
  background, so they scroll under the bar with the title.
- Expo, iPhone: native stack with `headerLargeTitle: true`, `headerLargeTitleStyle: { fontFamily:
  "Barlow-ExtraBold", fontSize: 34 }`, `headerTransparent` with `headerBlurEffect` (the existing
  `translucentBar` in `ui/navigation.ts`), `headerTintColor: link`, `headerBackTitle` on.
- Expo, Android: native stack has no large titles. Draw the website's pattern: a header 44 + status
  bar tall with the back chevron and label on the left (the screen's own component, not the default
  arrow) and the action on the right, the large title as the first element of the content, and the
  small title fading in when the large title's bottom passes under the bar (an `onScroll` threshold).
  `headerShadowVisible` off; the bar gets the solid glass fallback (2.5) once scrolled.

### 3.2 Tab bar

Web: `TabBar` in `components/nav-links.tsx`.

Look: a floating capsule, 12 in from the left and right, 8 above it and `max(12, bottom safe area)`
below it. Radius 28. Glass (2.5). Five equal items, each 56 tall: the icon (28, 1.8 stroke) over
the label (`tabLabel`), 2 apart.

- Unselected: outline icon and label in `textMuted`.
- Selected: **filled** icon and label in `link`. No highlight behind it.
- **Badge** (Messages only): unread conversations. A capsule 20 tall, at least 20 wide, 6 side
  padding, `primary` with `onPrimary` text, body semibold 12, tabular; "99+" over 99. Sits with
  its top 4 above the icon and its left edge 16 from the icon's left. Read as "N unread".
- Taps that land beside the bar (its margins) do nothing; they never reach the page under it.

Items, in order, and the icons (24 x 24 artboard, the website's own drawings, stroke 1.8, round
caps and joins). The apps use these same shapes so they match the website exactly; SF Symbols
stand-ins are listed for anything that can't take a custom image.

| Tab | Outline | Filled (selected) | SF Symbol stand-in |
|---|---|---|---|
| Today | Map pin with a round hole: `M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z` | Pin solid, hole cut out | `mappin` / `mappin` (fill) |
| Jobs | Clipboard page with two lines: `M9 4h6M8 4H6a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2M9 11h6M9 15h4` | Page solid, lines cut out | `doc.text` / `doc.text.fill` |
| Schedule | Calendar: `M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 12h3M8 16h3M13 12h3` | Calendar solid, header line and entries cut out, rings drawn | `calendar` |
| Messages | Speech bubble: `M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z` | Bubble solid, three dots cut out | `message` / `message.fill` |
| More | Circle with three dots: circle r 9, dots at x 8, 12, 16 | Circle solid, dots cut out | `ellipsis.circle` / `ellipsis.circle.fill` |

Behavior: tapping the selected tab pops its stack to the root, and tapping again scrolls to the
top (system behavior; the Expo bar does both). The bar stays on every screen pushed inside a tab,
as on the website (job page, conversation, settings pages). It is covered by sheets and by the
full-screen markup editor and signature screens.

Build: Swift uses the system `TabView` with `Tab(...)` items (decision 7). Images: render the paths
above to template `UIImage`s at launch (`ImageRenderer` of a `Path`), outline for the normal state;
SwiftUI's tab bar shows the `.fill` variant only for SF Symbols, so if the custom filled state can't
be supplied the SF Symbol stand-ins are acceptable. Badge with `.badge(count)` and tint the badge
`primary` (`UITabBarItem.appearance().badgeColor`). Expo draws the bar (section 8.2).

### 3.3 Cards

`.card`: `surface`, radius 20, the soft shadow (2.5), padding 20. A card's title is `cardTitle`.
Used for content that is one unit: a tip, Getting Started, a Today stop, a route, the report panel,
a quote, the invoice, a chemical step group, the Photos capture panel, a gallery item, a signature.

### 3.4 Grouped lists (inset grouped)

Web: `Grouped` and `Row` in `components/ui.tsx`, `.grouped` in `globals.css`.

- One block: `surface`, radius 12, no shadow, clipped.
- Optional **section label** above (`sectionLabel`, 8 above the block, aligned with the block's
  left edge, not inset).
- Optional **footer** below: `footnote` in `textMuted`, 8 below, inset 16.
- Rows separated by 0.5 `separator` hairlines starting 16 in.

**Row** (min 44 tall, 16 side padding, 10 top and bottom, items 12 apart):

- Optional leading icon.
- Label (body 17; `bodyEmphasis` for a person's or customer's name) with an optional detail line
  under it (`secondary`, `textMuted`). The detail may be two or three lines (job rows).
- Optional value on the right (body 17, `textMuted`, right-aligned), or a status chip, or money
  (semibold `text`, tabular).
- Chevron "›" when the row opens something: the `›` glyph at 20 pt in `textMuted` at 70% opacity
  (Swift: `Image(systemName: "chevron.right")`, footnote semibold, `textMuted` at 70%, which reads
  the same).
- Pressed: `rowPressed` fill.
- Row kinds used on phones:
  - Navigation row: label, optional detail, chevron.
  - Value row: label left, value right ("Tech · Tony Tech", "Detection fee · $649.00").
  - Stacked row: small `secondary` muted caption above the body value ("Why they called" over
    "Pool water level dropping").
  - Action row: link-colored text ("Show Tips Again", "Edit Contact Details", "Text Riley Rivera");
    destructive action row: centered `fail` text ("Sign Out").
  - Control row: label left, control right (switch, segmented, select, short number field).

Build: Swift `List { Section { } header: { } footer: { } }.listStyle(.insetGrouped)` with
`.contentMargins(.horizontal, 16, for: .scrollContent)` and `.listSectionSpacing(24)`; headers use
`sectionLabel` (turn off the default header style with `.textCase(nil)` and draw our own
uppercase text). Screens that mix cards, pills and lists (Today, Schedule, the job's Checklist,
Findings, Photos, Wrap-Up, Chemicals, Jobs) use `ScrollView` + `LazyVStack` with our own `Grouped`
view so every block lines up at 16. Expo: the existing `Group`/`ListRow` in `ui/components.tsx`,
restyled to these numbers.

### 3.5 Section labels and section headings

- Over a grouped list: `sectionLabel` (Barlow SemiBold 13 uppercase, `textMuted`).
- Inside a screen, starting a part: `sectionHeading` (Barlow Bold 24), 12 above its content
  ("Tests" then "No tests recorded."). Parts are 32 apart.
- On the Chemical Calculator, the column labels "READING" and "AIM FOR" are body semibold 13
  uppercase `textMuted`, right-aligned (these are not headings).

### 3.6 Status chips

Web: `Chip`, `StatusBadge` in `components/ui.tsx`.

A solid capsule: `footnote` semibold (13), 10 side padding, 2 top and bottom (about 22 tall), no
wrapping, text `onStatus` (white in light mode, navy `#12263A` in dark mode). Status always has its
word; color is never alone.

Job status (`JOB_STATUS_LABELS` in `packages/core/src/job-status.ts`):

| Status | Label | Fill |
|---|---|---|
| `unscheduled` | Unscheduled | `excluded` |
| `scheduled` | Scheduled | `text` (navy in light mode, near-white in dark) |
| `in_progress` | In progress | `info` |
| `report_sent` | Report sent | `info` |
| `quote_sent` | Quote sent | `info` |
| `quote_accepted` | Quote accepted | `warning` |
| `invoiced` | Invoiced | `warning` |
| `paid` | Paid | `pass` |
| `done` | Done | `pass` |
| `canceled` | Canceled | `excluded` |

Test outcome chips: Pass `pass`, Fail `fail`, Unclear `warning` (`inconclusive`).

Other chip-like labels:

- **Lock label** on a schedule stop ("Fixed time", "Two techs"): `fill` background, `text`, footnote
  semibold.
- **"No map location"**: plain footnote text in `warning`, no chip.
- **Quote and invoice status** appear in the card title text ("Quote #1006 · Accepted",
  "Invoice #1025 · Void"), not as chips. In list rows, invoice status is plain detail text.

The current Swift `StatusChip` (tinted text on a 14% fill, different colors) and the Expo
`JOB_STATUS_COLOR` are replaced by the table above.

### 3.7 Buttons

Web: `buttonClass` in `components/ui.tsx`. Every button is a capsule, at least 44 tall, 20 side
padding, body 17 **semibold**, icon and text 8 apart. Title Case, saying what happens.

| Kind | Fill | Text | Pressed | Use |
|---|---|---|---|---|
| Primary | `primary` | `onPrimary` | 10% darker (`brightness 0.95`) | The screen's one main action: Start Job, Create Job, Write Draft, Send by Email, Send Quote, Add Test (in its sheet), Sign In, Move |
| Secondary (tinted) | `tinted` (`link` 12%) | `link` | `link` 24% | Everything else: Search, Add Test, Add Finding, Save, Plan Route, Apple Maps, On My Way, Send by Text, Copy Link, Create Invoice, Start Quote, Export Invoices, Mark as Unread, Show More |
| Danger | `dangerTint` (`fail` 12%) | `fail` | `fail` 24% | Cancel Job, Delete (in a sheet), Delete Draft, Void Invoice, Delete My Account |
| Quiet | none | `link` | `link` 10% | Text-only actions: Move…, Report, PDF, Download PDF, Clear Pin, Use a Password Instead |

- Disabled: 50% opacity. Busy: the label changes to the "-ing" form ("Saving…", "Sending…",
  "Writing…", "Signing In…"); no spinner needed, but a small one may lead the label.
- Width: buttons size to their label and sit at the left (web), except in sheets' delete row and
  the sign-in form, which are full width. A row of two (Plan Route + Apple Maps) splits the width
  in half, 8 apart.
- Small variant (quiet buttons in a version list): 12 side padding, `secondary` 15.
- No outlined buttons. No orange buttons in the apps (orange is the marketing site's Start Free
  Trial only).

### 3.8 Pills (filters and choosers)

Web: `pillClass`. A sideways row of capsules: 44 tall, 16 side padding, body medium 17, 8 apart,
scrolling sideways edge to edge (first pill 16 in). Unselected: `fill` with `text`. Selected:
`primary` with `onPrimary` (decision 9). Used for Jobs' status filters, Reports' filters, Today's
and Schedule's "whose day" (Me, then teammates, then Everyone on Schedule).

The quote builder's "+ Repair item · $250.00" buttons are secondary buttons at 15 medium, not
pills; once added they read "✓ Repair item · $250.00", disabled.

### 3.9 Segmented controls

Web: `Segmented`, `SEGMENT_TRACK`, `segmentClass` in `components/ui.tsx` and `segmented.tsx`.

- **Track:** `fill`, radius 24, 2 padding, segments 2 apart. Sized to its content (each segment 16
  side padding) unless it fills its row. A label may sit above it (body medium 17, "Who is it
  for?").
- **Segment:** 40 tall (44 with the track), `segment` text (15 medium) in `text`.
- **Chosen:** a capsule thumb in `thumb` (white; dark `#636366`), semibold, with two shadows
  (`0 3 8` black 12%, `0 3 1` black 4%). It slides between segments.
- Two to five related views or states (house rule). Over five, use a select ("Choice").
- Accessibility: a radio group (one focus stop; arrows move); Swift `accessibilityRepresentation {
  Picker(...).pickerStyle(.segmented) }`.

Where they appear: Jobs | Reports (each segment at least 112 wide), Day | Week | Month (12 side
padding), New | Existing, Leak Detection | Repair (and pool-care types), Scheduled | Not Yet, a
finding's Status (Open | Quoted | Repaired | Monitor), the markup tool (Arrow | Circle | Text),
Appearance (Light | Dark, each at least 80 wide).

**The job's section switcher** is the same control with these differences: five equal columns
filling the width (four on a maintenance visit), segments 44 tall, `footnote` 13 (medium; semibold
when chosen), 4 side padding. A segment can carry a **to-do badge**: a capsule 20 tall, min 20
wide, `warning` with `onStatus` text, 11 pt, at the segment's top right (4 above it), read as ", N
to do" (the Checklist's items still to do). It sits on the page under the job's header; once
scrolled it **pins under the navigation bar** on the bar material, one hairline under both
(section 5.4).

### 3.10 Round contact buttons

Web: `iconButtonClass`, `components/contact-buttons.tsx`.

44 circle, `iconTint` fill (`link` 10%), icon 20 in `link`. Always named for screen readers ("Call
Riley Rivera, (480) 555-0188"; "Text Riley Rivera"; "Email Riley Rivera, riley@example.com").
Icons: phone handset, speech bubble, envelope (SF Symbols `phone`, `message`, `envelope`; Expo the
website's paths from `components/icons.tsx`). Placed 8 apart. Call uses `tel:`; Text opens New
Message to that customer when the company number is working, otherwise the phone's Messages app
(`sms:`); Email uses `mailto:`.

### 3.11 Tips

Web: `components/tip.tsx`; copy in `packages/core/src/walkthrough.ts` (`TIPS`).

A card (radius 20, soft shadow) with 12 top and bottom, 16 left, 4 right padding: a lightbulb icon
(24, 2 stroke, `link`, 2 down from the top), 12 gap, then the title (body semibold 17) over the
message (`secondary`, `textMuted`), then a 44 round close button (an "x" 16, 2 stroke,
`textMuted`). 20 below the tip to the next block. Closing hides it at once and remembers it
(synced to the person's `tips_seen`, as today). More › Show Tips Again brings every tip back.

The apps use the tips with `platform: "app"` where one exists for the screen, otherwise the web
tip's words for the same screen with browser wording removed (the Messages tip says "right-click it
on a computer"; the app's own tip "The shop's shared inbox" is used instead). Tips by screen are
role- and package-specific exactly as `tipFor` decides.

### 3.12 Notices

Web: `Notice` in `components/ui.tsx`.

A block, radius 16, `noticeFill` (the tone at 10%), 12 top and bottom, 16 right, 24 left. A 4 wide
capsule bar in the tone's color runs down the left, 10 from the edge and 12 from the top and
bottom. Text body 17 in `text`; a link inside is `link`, semibold, underlined ("Set Up a Number").
Tones: info (`info`), warning (`warning`), error (`fail`), success (`pass`). Errors are announced
(alert); others are polite status. No icon (the Swift `Notice` with a leading SF Symbol changes to
this).

### 3.13 Empty states

Web: `Empty`. A block, radius 16, `emptyFill`, 24 padding, centered body 17 in `textMuted`, an
inline link where there's somewhere to go ("Nothing on your route today. Open the schedule.").
The wording is specific to the screen (each screen lists its own).

### 3.14 Fields, selects, switches, search

Web: `Field`, `Select`, `TextArea`, `Checkbox` (switch) in `components/ui.tsx`; `GroupedField` etc.
for sign-in.

**Outlined field** (forms in cards and sheets):

- Label above: body medium 17, `text`. Optional "(optional)" is part of the label text.
- Box: at least 44 tall, radius 10, 1 pt `controlBorder`, `surface` fill, 12 side and 8 top and
  bottom padding, body 17 `text`, placeholder in `placeholder`.
- Hint under it: `secondary` in `textMuted`. Error under it in `fail` (and the box border turns
  `fail`).
- Focus: a 3 pt `focus` ring outside the box (1 pt gap).
- Text area: the same box, at least 96 tall, growing with its text.
- Money and numbers: `decimalPad` / `numeric` keyboard, tabular, right-aligned when the field is
  short (the job's detection fee).
- A unit can sit inside the box at the right in `secondary` muted ("gal").

**Select (choice)** looks like an outlined field with the chosen value in body 17 and a chevron
(`chevron.up.chevron.down`, footnote, `text`) at the right. Tapping opens the platform's menu
(SwiftUI `Menu`/`Picker(.menu)`, Android a dropdown menu). In a settings-style row (More ›
"Directions open in") the select is a compact outlined capsule-ish box (radius 12) with the value
in `link`.

**Grouped fields** (sign-in, Settings forms): one inset grouped block, each row 44 tall with the
label on the left at a fixed width (sign-in: 96) and the field filling the rest, no box; hairlines
between rows. Selects in this style show the value right-aligned in `textMuted`.

**Switch:** the system switch (iOS `Toggle`; Android: a switch drawn like iOS, 51 x 31, `fill`
track off, `pass` track on, white 27 knob with a soft shadow, since the website uses the iOS shape
everywhere). Always in a row with its label on the left; 44 tall row.

**Round check** (maintenance checklist items and Getting Started): 24 circle; to do = 2 pt
`controlBorder` ring; done = `pass` fill with a white check (3 stroke).

**Search field** (Jobs, Customers): an outlined field (radius 10, 1 pt `controlBorder`) with the
placeholder ("Customer name or job number"; "Name, phone, or email"), a magnifying glass at the
left and a clear button at the right while it has text. It filters as you type (data is on the
phone); there is no Search button (section 9).

**Date and time:** an outlined field that opens the system picker (iOS compact `DatePicker`;
Android the Material date and time dialogs). Shown as "Oct 19, 2026" and "9:00 AM", never
"mm/dd/yyyy".

### 3.15 Sheets and action sheets

Web: `components/sheet.tsx`.

**Sheet** (one short task: add or edit a test or finding, move a stop, settings list items, What to
Add, Suggested Times):

- Rises from the bottom, at most 92% of the screen tall, top corners 20, background `bg` (the
  grouped gray), the scrim behind it.
- A grabber (36 x 6 capsule, `text` at 25%) 8 from the top.
- A title bar: **Cancel** on the left (body 17 `link`; "Close" for read-only sheets), the title
  centered (`navTitle`), nothing on the right.
- Content scrolls with 16 side padding and 24 at the bottom; forms end with their primary button
  ("Add Test", "Save Finding"). Edit sheets end with a separator line and a full-width danger
  button ("Delete Test", "Delete Finding").
- Closes with a swipe down, Cancel, or a tap on the scrim. **Swipe down and scrim taps are blocked
  while there are unsaved changes**; Cancel then asks "Discard changes?" (existing decision,
  2026-10-14).
- Swift: `.sheet` with `.presentationDragIndicator(.visible)`, `.presentationBackground(bg)`,
  `.presentationCornerRadius(20)`, `.interactiveDismissDisabled(dirty)`; detents `.large` for
  forms, `.medium, .large` for Move and Suggested Times. Expo: native-stack `presentation:
  "formSheet"`/`"modal"` on iOS; on Android a bottom sheet drawn the same way (the existing
  `ui/sheet.tsx`).

**Action sheet** (every confirmation): from the bottom, 8 from the edges:

- A panel (radius 14, glass) with the title in `footnote` semibold `textMuted` centered, an optional
  message under it in `footnote` `textMuted`, then the action as a 56 tall row in 20 pt: `fail` if
  destructive, `link` otherwise, with a hairline above.
- A separate panel, 8 below: **Cancel**, 56 tall, 20 pt semibold `link`.
- Swift: `.confirmationDialog(title, titleVisibility: .visible)` with `Button(role:
  .destructive)`. Expo iOS: `ActionSheetIOS`; Android: the same drawn panels (not a Material
  dialog, decision 2).

Confirmation copy used across the screens: "Cancel this job?" / Cancel Job; "Remove {item} from
the checklist?" / Remove Item; "Delete this {test type}?" / Delete Test; "Delete “{finding}”?" /
Delete Finding; "Remove this photo from the job?" + "The original stays on file." / Delete Photo;
"Write the draft again?" + "The new draft replaces this one, including your edits." / Replace
Draft; "Remove “{line}” from the quote?" / Remove Line; "Delete this draft invoice?" / Delete
Draft; "Void this invoice? The customer's link will show it as void." / Void Invoice; "Remove
{name}'s signature?" / Remove Signature; "Discard changes?" / Discard Changes.

### 3.16 Swipe actions

Rows that can be removed or changed swipe, always with a visible way to do the same thing:

- Tests and findings: swipe left shows a red **Delete** (88 wide, `fail`, white semibold 17); a
  full swipe asks first. Visible alternative: Delete inside the row's edit sheet.
- Schedule stops: swipe left shows a blue **Move** (`link`, white). Visible alternative: the
  "Move…" button on the stop.
- Conversations: swipe right shows **Unread** / **Read** (`link`, white); a full swipe toggles.
  Visible alternative: Mark as Unread in the conversation. A long press opens a context menu with
  the same (in place of the website's right-click).
- Swift: `.swipeActions` in a `List`; in a `LazyVStack`, the same gesture code as the website.
  Expo: `ui/SwipeRow.tsx`.

### 3.17 Sync bar (apps only)

The apps' existing `syncBarMessage` (Swift `Model/SyncBar.swift`, Expo `ui/SyncBar.tsx`) keeps its
wording. Look: a capsule row 44 tall, full content width, 16 under the large title block (above
any tip), `secondary` text with a 10 dot in the tone's color at its left and a chevron at its
right; fill: good `pass` at 10%, working `info` at 10%, attention `warning` at 10%, problem `fail`
at 10%. Hidden when everything is synced (the message is nil). Tapping it opens More › Sync.
Shown on Today, Jobs and the job page. When there are problems, the More tab shows a small `fail`
dot badge.

### 3.18 Pool diagram and shape picker

Web: `components/pool-diagram.tsx`, `shape-picker.tsx`; shapes from `poolDiagram()` in
`packages/core`.

- Diagram: a card-like white block (radius 12, `surface`), the pool path filled `diagramWater`
  with a 2 pt `water` outline, the spa as a circle (same fill and outline) labeled "SPA" in Barlow
  Bold `water`. Finding pins: a circle r 6 in the severity color with a `surface` ring (r 7.5) and
  the finding's number. Tapping the diagram in the finding sheet places the pin.
- Shape picker: a centered grid of tiles (about 64 x 64, radius 16, `fill` background): the shape
  drawn in `diagramWater`/`water`, its name under it in `footnote` medium ("Rectangle", "Oval",
  "Kidney", "L-shape", "Freeform"). The chosen tile has a 2 pt `link` ring.

---

## 4. Navigation and roles

### 4.1 Tabs

| # | Tab | Root screen |
|---|---|---|
| 1 | Today | Today (5.1) |
| 2 | Jobs | Jobs (5.2), with Jobs and Reports in a segmented control |
| 3 | Schedule | Schedule (5.6) |
| 4 | Messages | Messages (5.7), badge = unread conversations |
| 5 | More | More (5.8) |

Every role sees the same five tabs. Each tab has its own navigation stack; switching tabs keeps
each stack where it was.

### 4.2 What's under More, per role

Roles: `owner`, `admin` (both "managers"), `tech` (DECISIONS 2026-10-18). The list is
`officeLinks(...).slice(4)` from `apps/web/src/lib/nav.ts`, minus Dashboard (decision 12):

| Row | Tech | Admin | Owner |
|---|---|---|---|
| Customers | Yes | Yes | Yes |
| Invoices | Yes | Yes | Yes |
| Chemical Calculator ("Chemicals" on the website's list) | If the shop offers pool care | Same | Same |
| Settings | No (the website shows the "owners and admins" notice) | Yes | Yes |

Then for everyone: Your Account, On This Device, Sync (apps only), Help, Sign Out, Delete My
Account (5.8).

### 4.3 Other role differences on phones

- **New Job "+"**: shown on Today, Jobs and Schedule when the person may make jobs
  (`mayMakeJobs` / Swift `canMakeJobs`: managers always; techs if the shop allows it).
- **Today › whose day pills**: managers, when the shop has more than one tech.
- **Schedule › Needs a Time**: managers only. Techs who only see their own jobs see only their own
  route and pills.
- **Getting Started card on Today**: managers, until every step is done or they tap Hide.
- **Job › Details › Timeline**: managers only.
- **Job › Wrap-Up › "payments not set up" notice, Record Payment, Void Invoice**: managers only.
  Discounts above the shop's tech limit: managers only.
- **Invoices › Export Invoices / Export Payments**: managers only (section 9: in the apps these
  share a CSV file).
- **Messages notice**: managers see "Set Up a Number" as a link; techs see "Ask an owner to set up
  a company number."
- **Tips** are by role (`roles` in `TIPS`).

### 4.4 Screens and what pushes from where

All pushes are full-screen with the tab bar still showing, a large title, and "‹ {previous
screen's title}" as Back. Sheets cover the tab bar.

```
Today ─┬─ Job ─┬─ Checklist item (apps only) ── Photo viewer
       │       ├─ Customer
       │       ├─ Conversation
       │       ├─ Repair job (from an accepted quote)
       │       ├─ Signature / Review and Sign (full screen, no tab bar)
       │       └─ [sheets] Add/Edit Test, Add/Edit Finding, Mark Up (full-screen cover)
       ├─ New Job
       └─ Schedule (from "Open the schedule"; switches to the Schedule tab)
Jobs ──┬─ Job (as above)
       ├─ New Job
       └─ Reports (segment, same screen) ── Job › Wrap-Up
Schedule ─┬─ Job
          ├─ New Job
          └─ [sheets] Move, Suggested Times
Messages ─┬─ Conversation ── Customer
          └─ New Message
More ─┬─ Customers ── Customer ── Job
      ├─ Invoices ── Job › Wrap-Up (scrolled to Invoice)
      ├─ Chemical Calculator
      ├─ Settings ── each settings page ── [sheets] add/edit rows
      ├─ Two-Step Sign-In
      └─ Sync (apps only)
```

Links that cross tabs (Today's "Open the schedule", a job's conversation row) push inside the
current tab, as the website does, except "Open the schedule", which switches to the Schedule tab.

### 4.5 The top bar on each screen

| Screen | Left | Small title | Right |
|---|---|---|---|
| Today | (none) | Today | "+" New Job (if allowed) |
| Jobs / Reports | (none) | Jobs / Reports | "+" New Job (Jobs only, if allowed) |
| Job | ‹ {previous: Jobs, Today, Schedule, Customer name, Invoices} | Job #1040 | (none) |
| New Job | ‹ {previous} | New Job | (none) |
| Checklist item | ‹ Job #1040 | {item name} | (none) |
| Schedule | (none) | Schedule | "+" New Job (if allowed) |
| Messages | (none) | Messages | compose (if the number is working) |
| Conversation | ‹ Messages | {person's name} | (none) |
| New Message | ‹ Messages | New Message | (none) |
| More | (none) | More | (none) |
| Customers | ‹ More | Customers | (none) |
| Customer | ‹ Customers | {name} | (none) |
| Invoices | ‹ More | Invoices | (none) |
| Chemical Calculator | ‹ More (or ‹ Job #N from a visit) | Chemical Calculator | (none) |
| Settings | ‹ More | Settings | (none) |
| A settings list page | ‹ Settings | {page} | "+" Add (when the page adds rows) |
| Two-Step Sign-In | ‹ More | Two-Step Sign-In | (none) |
| Sync | ‹ More | Sync | (none) |

---

## 5. Screens

Copy in quotes is exact. `{braces}` are data. Dates and times use `packages/core` formatting
(`formatDay`, `formatSchedule`, `formatTime`, `formatCents`), which Swift already ports.

### 5.1 Today

Large title **"Today"**; managers looking at a teammate's day: **"Today · {Name}"**.

Top to bottom:

1. Bar: "+" New Job (if allowed).
2. Subtitle: the shop's date, long ("Sunday, October 18"), then 12 to the right the weather: an
   icon (24, 1.8 stroke, `text`: sun, moon, clouds, rain, storm, snow, fog, wind, dust by day or
   night), then "**76°** Mostly Clear" (temperature semibold) and " · High 85°" in `textMuted` when
   known. The weather is the shop ZIP's; it is left out when unknown or offline. Wraps to a second
   line if needed.
3. Header action, when the day has stops and directions: a secondary button with a pin icon, "Open
   Route in Google Maps" (whole route) or "Next Stop in Apple Maps" (Apple Maps takes one stop),
   by More › Directions open in.
4. Sync bar (3.17), if any.
5. **Getting Started** (managers, 4.3): a card with no padding of its own:
   - Top, 20 side padding, 16 from the top: "Getting Started" (`cardTitle`) over "{n} of {total}
     done" (`secondary`, muted); "Hide" (body `link`, 44 target) at the right.
   - A progress bar 6 tall, 8 below, 20 in from each side: `fill` track, `pass` fill, capsule.
   - The steps, 12 below, as rows (min 48, 20 side padding, 10 top and bottom, hairlines between
     full width): a round check (3.14), the step's label (body; done: `textMuted` struck through)
     with its detail (`secondary`, muted; hidden when done), and a chevron. Steps and links from
     `gettingStarted()` in `packages/core/src/walkthrough.ts`, e.g. "Invite your techs" (They sign
     in on the Sundeck Pro app.), "Add your logo" (It goes on every report, quote, and invoice.),
     "Set up customer payments" (Card, Apple Pay, or bank, paid to your own Stripe account.),
     "Book your first leak job" (Inspect it on the phone.), "Send your first report" (Finished on
     site and sent to the homeowner.). Rows open the matching settings page, Jobs, or New Job.
6. Tip (Today's): "Your day, stop by stop" / "Today lists the stops in order, with directions. On
   My Way texts the customer that you're coming."
7. **Whose day** (managers with more than one tech): pills, "Me" first, then teammates by name; 20
   below.
8. With no stops: empty state "Nothing on your route today. [Open the schedule]." (or "this route"
   for a teammate).
9. With stops:
   - Summary line, muted body: "{n} stops · {1 h 20 min} driving · back by {4:30 PM}" (drop "back
     by" when unknown).
   - For each stop, a **leg line** then the **stop card**, 4 apart:
     - Leg line: 16 in, a dotted vertical line (2 wide, 16 tall, `textMuted`), 8 gap, `secondary`
       muted "{12 min} from the shop" (first stop) or "{12 min} drive"; when the drive makes the
       stop late, append " · {15 min} late" in `warning` semibold.
     - Stop card: a card with 12 padding. The **next stop** (the first scheduled or in-progress
       one) has a 2 pt `link` ring. Finished stops are at 70% opacity.
       - Row 1: the stop number in a 32 circle (Barlow Bold 17; next stop: `link` fill with `bg`
         text; others: `bg` fill, `text`), the start time (Barlow Bold 17), a status chip only when
         not "Scheduled", a lock label in `footnote` semibold muted ("Fixed time") when the stop
         can't be moved; at the right (not on finished stops) a round **Call** button (if the
         customer has a phone) and, on your own route, the **On My Way** secondary button (12 side
         padding).
       - Row 2: the customer's name, body semibold, one line.
       - Row 3 (not on finished stops): the address in `link`, `secondary` 15, opening directions.
       - Access notes (not on finished stops): `secondary` 15 on `accessFill`, radius 8, 8 side and
         4 top and bottom padding, at most 2 lines, 4 below the address.
       - The whole card opens the job; the address, Call and On My Way are separate targets.
   - After the last stop, a leg line "{20 min} back to the shop".

**On My Way** sends "on my way" with an arrival time (`onMyWayText` in core). Its label changes for
3 s to "Sending…", then "Texted ✓", "Shared ✓", "Copied ✓" or "Not Sent" (no toast). With the shop
set to send from the company number but no working number, it first asks: "On My Way goes out from
your company number, which isn't working yet." + (managers) "Set it up in Settings › Phone and
Texting. You can send this one from your phone." / (techs) "Ask an owner to set it up. You can send
this one from your phone." / **Send From My Phone**. From the phone: the Messages app with the text
filled in (`sms:`), else the share sheet.

Data note: drive times and "back by" come from the server's route planner (`loadRoutes`), and the
weather from `weatherForZip`. Offline, Today shows the stops in order from the phone's database
without the leg lines' minutes and without weather. See section 10 for the endpoints this needs.

### 5.2 Jobs

Large title **"Jobs"**. Bar: "+" New Job (if allowed).

1. Segmented **Jobs | Reports** (each at least 112 wide), 20 below. Choosing Reports switches this
   screen's content and the large title to "Reports" (5.3); the tab stays Jobs.
2. Sync bar, if any.
3. Tip (app tip "Today comes first" for this screen, or the web's "Every job, start to finish" /
   "Open a job for its checklist, tests, findings, report, and quote, all on one page.").
4. **Status filter pills** (3.8), in order: Open, Unscheduled, Scheduled, In Progress, Waiting on
   Customer, Paid, Done, Canceled, All. Open = `OPEN_STATUSES`; Waiting on Customer = report sent,
   quote sent, quote accepted, invoiced. 20 below.
5. **Search field**: "Customer name or job number", filtering as you type. 20 below.
6. The list, one inset grouped block, a row per job, newest scheduled first as the website orders:
   - Label: customer name, `bodyEmphasis`.
   - Detail (`secondary`, muted), three lines: "#1040 · Leak detection" (or "New job · ..."), the
     pool's address on one line (truncated), then in `text` color "Sun, Oct 11, 9:00 AM · Tony
     Tech" (in progress: "Started · Tony Tech"; no tech: "Unassigned"; no date: as
     `formatSchedule` says).
   - Value: the status chip, vertically centered. Chevron.
   - Opens the job.
7. Empty: "No jobs here. Add one with New Job, or on the phone." With a search: "No jobs match
   “{text}”."

The list loads lazily as it scrolls (no Show More, section 9).

### 5.3 Reports (Jobs › Reports)

Large title **"Reports"**, no "+". Segmented Jobs | **Reports**. Filter pills: All, Sent, Drafts.
One grouped list, newest first, a row per report:

- Label: "**{Customer}** · Job #1040" (the job number in `textMuted`).
- Detail: "Homeowner report · version 2 · {street}".
- Value: "Sent Oct 15, 2026" or "Draft".
- Opens the job on Wrap-Up.

Empty: All: "No reports yet. A job's report is drafted from its Wrap-Up."; Sent: "No reports sent
yet."; Drafts: "No drafts."

### 5.4 The job page

Large title **"Job #{number}"** ("New Job" before it has a number). Back: "‹ {previous}".

Header, under the title:

- Subtitle row (wrapping, 12 apart): the **status chip**; the job type in `textMuted` ("Leak
  detection", "Repair", "Maintenance"; a plan visit reads "Maintenance plan" as a `link` to the
  customer); then on its own line the time ("Sun, Oct 11, 9:00 AM", or "Started {time}" while in
  progress).
- Status actions (header actions): the next steps from `userTransitions` except Cancel: **Start
  Job** (primary), **Move Back to Scheduled**, **Reopen Job**, **Mark Done** (secondary).

**Section switcher** (3.9), 16 below the header, then pinned under the bar when scrolled: Details,
Checklist (with its to-do badge), Findings (not on maintenance visits), Photos, Wrap-Up. Changing
section scrolls to the top of the page. The section shown is remembered per job while the app runs
(the website keeps it in the URL; links from Reports and Invoices open Wrap-Up).

The current section's content follows, 16 below the switcher.

#### Details

Groups 24 apart:

1. **CUSTOMER**: row 1, the customer's name (`bodyEmphasis`), chevron, opens the customer. Row 2:
   the phone over the email (`text` and `secondary`, left) with the round Call, Text and Email
   buttons on the right. No customer: "No customer".
2. **MESSAGES** (when the customer has a conversation or texting works): the latest conversation
   as a row (name, last message preview, time; opens it) and an action row "Text {Customer}"
   (`link`) that opens New Message to them about this job.
3. **CUSTOMER LINKS** (links sent for this job), a row each: "Report" / "Invoice" / "Quote" with
   "Opened 2 times, last Oct 15 · Works until Apr 13" (`secondary`, muted) and **Turn Off** on the
   right (body, `fail`, a quiet button). Footer: "Anyone with a link can open it, so turn one off if
   it went to the wrong person. Links stop working after 180 days; sending again makes a new one."
4. **POOL**: the address as a `link` (opens directions) with "Gunite / plaster · Pool and spa"
   under it; "Access" over the access notes when there are any; when the pool has no map location,
   a row "Not on the map yet." (`secondary` muted) with a **Mark Location Here** secondary button.
5. **ASSIGNED TO**: value rows "Tech" (name or "Nobody yet"), "With" (second tech, if any),
   "Detection fee" (money, if set).
6. **WHEN THEY BOOKED** (intake answers): stacked rows, the question in `secondary` muted over the
   answer ("Why they called" / "Pool water level dropping").
7. **ON SITE**, a grouped form:
   - "Detection fee" on the left, "$" in muted, a 112 wide outlined number field on the right
     ("649.00", right-aligned, tabular).
   - "Leak location marked" with a switch.
   - "Job notes" (`secondary` muted) over an outlined text area (placeholder "Anything the office
     should know").
   - Footer: "The detection fee is shown on the report."
   - A secondary **Save** button 16 below. (The apps save each field as it changes through the sync
     layer; the Save button stays as a visible confirmation and saves the notes field if still
     focused.)
8. **SCHEDULE** (repair jobs, and jobs not yet started): the tech and time as value rows, the
   time's "Fixed time" switch, and **Suggest Times** / **Change** controls as on the website's
   `JobSchedule`. (S8; see section 7.)
9. **TIMELINE** (managers): a white block (radius 20) of lines "{What} · {Who} · {Thu, Oct 15, 3:35
   AM}" in `secondary`, three shown, then "Show {29} More" (`link`). Each line wraps (section 9:
   the website truncates the "what").
10. **Cancel Job** (danger button), 32 below, asking "Cancel this job?" / Cancel Job. Only when
    the job can be canceled.

#### Checklist

1. "Checklist" (`sectionHeading`), then the tally in `textMuted`: leak detection "23 not leaking ·
   1 attention · 1 leaking · 2 not applicable · 0 to do"; maintenance "{n} done · {n} need
   attention · {n} skipped · {n} to do". No checklist yet: "No checklist yet." and the secondary
   **Set Up Checklist** button.
2. App tip for the job ("Work down the checklist" / "Inspect step by step").
3. **One block per checklist section** (`CHECKLIST_SECTION_LABELS`: e.g. "Visual Leak
   Inspection", "Plumbing Static Test", "Bond Beam"), 12 apart. Each is a grouped block (radius 12):
   - Header row, 56 tall: a chevron (20, `textMuted`, pointing right; turned down when open), 12,
     the section's name (body **semibold** 17), and on the right its summary in Barlow SemiBold 15:
     "{n} of {m} to do" (`textMuted`), "All clear" (`pass`), "{n} leaking" (`fail`), "{n}
     attention" (`warning`, decision 10), combined "1 leaking · 1 attention" (`fail`); maintenance:
     "All done" / "{n} need attention". Open while it has items to do; tap to fold.
   - Open: a hairline, then a row per item:
     - Leak detection item: the item's name (body medium, tight line) with a sub-line in
       `footnote` muted ("{method} · {notes}"), and on the right the **verdict pill**: a capsule 44
       tall, 12 left and 32 right padding, `secondary` 15 semibold, a down chevron (16) 10 from its
       right. To do: `fill` with `text`, "To Do". Chosen: solid `pass` / `fail` / `warning` /
       `excluded` with `onStatus` text, the verdict's label (`verdictOptions(type)` in core, e.g.
       "Not Leaking", "Leaking", "Attention", "Not Applicable", or Yes/No for yes-no items). Tapping
       opens a menu of the options, and "Remove Item…" for items that can repeat.
     - Leaking or Attention: an outlined field under the row, `bg` fill, placeholder "Where? Under
       the deck, at the throat…", saved when it loses focus.
     - Excluded with a reason: the reason in `secondary` muted under the row.
     - Maintenance item: a round check (3.14) and the name; done items' names in `textMuted`; items
       that can repeat get a 44 "x" remove button.
     - **Apps only:** tapping the item's name (not the pill) opens the **Checklist item** screen
       (`ComponentScreen`), which holds what the website has no room for on a phone: method,
       notes, exclusion reason, photos and voice notes on the item. When the item has photos, its
       sub-line starts with "{n} photos".
   - Under the items, while any are to do: a hairline and a `link` action "Mark {n} Remaining Not
     Leaking" ("Answer {n} Remaining No" for yes-no items; "Mark {n} Remaining Done" for
     maintenance).
4. **Add an item**: a select "Choose…" listing "Another {type}" for repeatable types and the item
   types the pool could have that aren't on the list, beside a secondary **Add** button (disabled
   until something is chosen). Hidden when there's nothing to add.
5. Maintenance visits: a secondary **Chemical Calculator** button (opens it with the pool's
   gallons).

#### Findings (leak detection jobs)

1. **Tests**: "Tests" (`sectionHeading`); "No tests recorded." in `textMuted`, or a grouped list, a
   row per test: the test's name (`bodyEmphasis`), "{item} · {Today 9:40 AM}" (`secondary` muted),
   the calculated summary in body medium, each recorded field "Label: value" (`secondary`, label
   muted), notes; on the right the outcome chip (Pass / Fail / Unclear) and a chevron. Tap: Edit
   sheet (6.1). Swipe left: Delete. Then a secondary **Add Test**.
2. **Findings**, 32 below: "Findings" (`sectionHeading`). "No findings recorded." or:
   - The **pool diagram** (3.18), full width, with the findings' pins.
   - A grouped list, 20 below, a row per finding: a 28 circle in the severity's color with the
     finding's number (body bold 15, white), then the title (`bodyEmphasis`), "{Severity} · {item}
     · {Open|Quoted|Repaired|Monitor} · Pinned on the diagram" (`secondary` muted), the location in
     body, the notes in `secondary`; chevron. Hairlines start at 60. Tap: Edit Finding sheet (6.2).
     Swipe left: Delete.
   - A secondary **Add Finding**.

#### Photos

1. "Photos and Recordings" (`sectionHeading`).
2. **Capture card** (card, 16 padding): when the job has findings or items, a select "Attach to"
   (Whole job, "Finding: {title}", each item's name); then three equal tiles in a row, 8 apart:
   **Add Photo** (camera), **Add Video** (video camera), **Voice Note** (microphone). Each tile 56
   tall, radius 16, `iconTint` fill, icon 24 over the label (`secondary` 15 semibold, tight line),
   all `link`. Under the tiles, a live status line: "Uploading voice note…" (muted), then "Voice
   note added." (`pass`) or the error (`fail`). In the apps Add Photo opens the camera, with "Choose
   from Library" offered from a long press or a menu (existing S5 behavior); nothing waits on
   uploads, which run in the background.
3. Empty: "No photos or recordings yet."
4. Otherwise one card per item, 16 apart, newest first:
   - The photo (4:3, its markup drawn over it), the video (16:9 on `navy`), or an audio player row.
     Not uploaded yet: a 4:3 `bg` block "{Photo} still uploading from the phone" (on the phone that
     took it, the local file shows instead).
   - Under it, 12 padding, `secondary` 15: "{Photo} · {attached to}" (medium) with " · 0:42" for
     recordings, the caption, the transcript in italics in quotes, then "{Today 9:40 AM} · location
     recorded" in muted.
   - Buttons: **Mark Up** / **Edit Markup** (secondary, photos only) and **Delete** (danger, asks
     "Remove this photo from the job?" + "The original stays on file." / Delete Photo).
   - Tapping the photo opens the viewer (6.5).

#### Wrap-Up

Sections 32 apart:

1. **Report and Sign-Off** (`sectionHeading`), then `secondary` muted: "Write Draft fills in the
   report from this job's checklist, tests, and findings. Read and edit it before sending."
   **Report card** (card, 20 padding):
   - Title row: "Homeowner report" (`cardTitle`, the template's name); at the right "Show Draft" /
     "Hide Draft" (`link` semibold with a chevron) when a draft exists, and "View version {n}"
     (`link`, underlined) once one is sent.
   - **Write Draft** (primary) or, with a draft, **Write the Draft Again** (secondary; asks first).
     Status under it (a success or error notice).
   - The draft, when shown: a warning notice "Check these before sending:" with a bulleted list of
     problems; then each section as an outlined text area with its title above (body medium);
     **Save Text** (secondary) with "Saved." in `pass` beside it.
   - A hairline, then "Finish version {n}" (body medium) and `secondary` muted "Hand the phone to
     the customer: they read the report and sign at the bottom. Signing locks this version;
     changes after that go out as a new version."; **Review with Customer** (primary) opens the
     Review and Sign screen. Under it a disclosure "Send Without a Signature" (`link` semibold) that
     opens "Sending saves your edits and locks this version." and the send controls.
   - Collapsed draft: "Draft version {n} is ready to read, edit, and review with the customer."
   - A hairline, then "Version {n} is finished" (body medium), "Send it to the customer, or
     download the PDF." (muted); **Customer email** field (prefilled); **Send by Email** (primary
     when no draft, else secondary) and **Send by Text** (secondary); **Download PDF** (quiet).
     After a text: "Message to text the customer" with **Copy Message**.
   - A hairline, then "Versions": a row per sent version, "Version 2 · Oct 15, 2026, 10:39 AM"
     (" · replaced" for old ones) with quiet **Report** and **PDF** buttons.
2. **Signatures** (`sectionHeading`). None: "None yet. The customer signs at the end of the report:
   write the draft, then Review with Customer." Otherwise a card per signature: the signature image
   (80 tall on `paper`, radius 4), "{Name} · {role}" (semibold, role muted), "{Purpose} · {date}"
   (muted), a quiet **Remove** that asks "Remove {name}'s signature?" / Remove Signature. Then the
   **work authorization** form when the shop uses it (signs before the work): "Signing for", "Your
   name", "Role (optional)", the pad, as on the website's `SignatureForm`; in the apps it opens the
   Signature screen.
3. **Quotes** (leak detection and maintenance jobs) (`sectionHeading`):
   - Managers, when a sent quote can't take deposits: warning notice "Customers can accept quotes
     but can't pay deposits online until payments are set up. [Set up payments]".
   - No draft or accepted quote: "No quote yet. Start one to price the repairs for these findings."
     (muted) with a secondary **Start Quote**.
   - A card per quote: title row "Quote #1006 · Accepted" (`cardTitle`) with the total at the right
     (20 semibold, tabular). Draft: the builder (6.4). Sent: the lines ("Repair underground pressure
     line (per break)" left, money right, `secondary` 15), "Deposit $625.00 · paid (card)" (muted),
     the customer link row (a read-only outlined field showing the link in monospace, truncated,
     beside a secondary **Copy Link**; the apps add a share button), and when accepted "Accepted
     by Riley Rivera on Oct 14, 2026. [Repair job #1296]" (link, opens the repair job).
   - Draft footer: **Send Quote** (primary) and "Locks the prices and gives you a link for the
     customer." (muted).
4. **Invoice** (`sectionHeading`):
   - None yet and the job is past starting: a card with the hint (repair: "Copies the accepted
     quote and credits the deposit already paid. You can change it before sending."; with a fee:
     "Bills the detection fee of $649.00. You can add lines before sending."; else "Starts an empty
     invoice. Add the lines before sending.") and a secondary **Create Invoice**.
   - Not started: empty state "Start the job before invoicing it." Maintenance: "Finished visits are
     billed once a month, one invoice per customer, from the Invoices page." or "This visit is on
     the customer's monthly invoice. Find it on the Invoices page."
   - An invoice card: "Invoice #1025 · Draft" with the total; the lines (description left, "× 2" for
     quantities, " · no tax" in muted, money right, hairlines between; drafts have a quiet
     **Remove** per line); totals block after a hairline: Subtotal, Discount (−), Tax, Deposit paid
     (−), **Total** (bold), then for sent invoices Paid and **Balance due** (bold), all
     `secondary` 15 with money right-aligned and tabular.
   - Draft: "Add a Line" (`subHeading`): Description; Quantity (default 1) and Price ($) side by
     side; Taxable switch (on); **Add Line**. "Details": Discount ($) and Due date ("Empty: due on
     receipt.") side by side; "Note to the customer"; **Save**. "Send": Customer email ("Their
     other emails get it too."); **Send by Email** (primary) and **Send Without Email**
     (secondary); "Sending locks the invoice and gives you a link for the customer." Then **Delete
     Draft** (danger, asks).
   - Sent: the payments ("$375.00 · Card · Paid · Oct 15, 2026"), the customer link with Copy Link,
     and for managers "Amount received ($)" (prefilled with the balance; "A check, cash, or
     anything paid outside Sundeck Pro.") with **Record Payment**, and **Void Invoice** (danger,
     asks) while nothing is paid.
   - Under the card: "Voided: #1025 ($649.00), #1020 ($0.00)" in `secondary` muted.

### 5.5 New Job

Pushed (decision 3). Large title **"New Job"**, "‹ {previous}". Subtitle: "Accepted quotes make
their own repair jobs." (pool-care shops: "A pool service visit, a plan that repeats, or a repair.
Accepted quotes make their own repair jobs."). Techs without permission see only the notice "Your
office makes new jobs. Ask an owner or admin to add this one."

Sections, each a section label and a card (20 padding) of outlined fields 16 apart:

1. **CUSTOMER**: "Who is it for?" **New | Existing** (only if the shop has customers).
   - New: Name; Phone; Email; "Other emails (optional)" with "They get reports too. Separate with
     spaces."
   - Existing: "Customer" select ("Choose…", then "{Name} ({detail})"); then "Pool" select (the
     customer's pools, "Another address…").
2. **POOL** (new customer or another address): Street address; City; State and ZIP side by side
   (State 2 letters); "Pool type" select ("Not sure" first); "Has a spa" switch row; "Pool shape
   (optional)" with "Leave it blank if you don't know yet; it can be set on the job's Findings." and
   the shape picker (3.18); "Access notes (optional)" text area with "Gate code, dog, where to
   park."
3. **VISIT**: "Job" segmented (Leak Detection | Repair, or the shop's types from `newJobTypes`).
   - Maintenance with plans: the repeat choice (`PlanRepeat`), then First visit (date; hint
     "Repeats on this weekday." / "Visits start on or after this date." / "Repeats on this weekday
     in the same week each month."), "Time (optional)" ("Blank: route planning picks it."), "Visit
     length (minutes)", "Last visit (optional)".
   - Otherwise "When": **Scheduled | Not Yet**. Scheduled: Date, Start (default 9:00 AM) and Hours
     (default 2) in one row (Date about half, Start a third, Hours the rest); a quiet **Suggest
     Times** for an existing pool, whose pick fills the row and says "Filled in: {Tue, Oct 20} at
     {9:00 AM} with {Tony Tech}." in `pass`.
   - "Tech" select ("Nobody yet" first for managers); "Second tech (optional)" ("None").
   - "Detection price" select ("Pick from the price book…") then "Detection fee ($)" ("Shown on the
     report and billed on the invoice."); for plans "Price per month ($)"; for others "Price ($)".
4. **WHEN THEY CALLED** (the shop's intake questions): checkbox questions as switch rows ("Why they
   called": Pool water level dropping, Spa water level dropping, Pool company told them to call,
   Other); choice questions as selects ("Size of the pool": Not asked first); text questions as
   fields ("Spa size or dimensions"); then "Notes for the tech (optional)". Shops without intake
   questions get a **NOTES** card with just the notes.
5. **Create Job** (primary; plans: **Start Plan**), 16 below the last card, left-aligned.

Created offline through the sync layer (customer, pool and job in one transaction), then the new
job replaces New Job in the stack.

### 5.6 Schedule

Large title **"Schedule"**. Bar: "+" New Job (if allowed).

1. Subtitle: Day "Sunday, October 18"; Week "Mon, Oct 12 – Sun, Oct 18"; Month "October 2026"; when
   not on today, " · **Today**" (`link` semibold) jumps back.
2. Tip (managers): "Day, week, or month" / "Switch views at the top. Plan Route puts a tech's stops
   for the day in driving order."
3. **Control row**, one line: three round 44 secondary buttons, Previous "‹", **Go to date** (a
   calendar icon; opens the system date picker), Next "›"; then at the far right the segmented
   **Day | Week | Month** (12 side padding per segment). Swiping the content sideways is not used
   (only the week strip swipes).
4. Day view only: the **week strip**, edge to edge: Monday to Sunday, 7 equal cells (at least 48
   wide, 56 tall, radius 12, 4 apart, 16 side padding): weekday (body medium 13) over the day
   number (Barlow Bold 20). Chosen day: `text` fill with `bg` text (navy with near-white). Today
   (when not chosen): `link` text. Swipe the strip sideways: it follows the finger; past a quarter
   of its width, or a flick, it moves to the week before or after on the same weekday.
5. **Whose schedule** pills (when more than one person is visible): "Me", then teammates, then
   "Everyone". The default is the first person with work in view (you first).
6. Notices: no shop location: warning "Routes start and end at the shop, which has no map location
   yet. [Set it in Settings › Scheduling]" (techs: "An owner can set it in Settings › Scheduling.");
   pools without a location: `secondary` muted "Pools marked “No map location” aren't counted in
   drive times. Open the job and use Mark Location Here at the pool" + (managers) ", or Find Pool
   Locations in Settings › Scheduling" + ".".
7. **Needs a Time** (managers, Day and Week): a card (16 padding): "Needs a Time ({27})"
   (`cardTitle`); a sideways row of cards (wells, radius 16, each about 85% of the width): "**Diana
   Foster** · #1088" on one line, the address and note on a second (`secondary` muted, truncated),
   and a 44 round "…" (`link`) opening actions **Suggest Times** and **Move…**. Suggest Times opens
   the Suggested Times sheet (6.3). Empty: the card says nothing is waiting, as on the website.
8. **Day view**: one **route card** per shown person (card, 16 padding):
   - "{Priya Shah}" (`cardTitle`), "{7} stops · {0 min} driving · back by {12:00 PM}" (`secondary`
     muted); "Runs {45 min} past the end of the day." in `warning` semibold when over.
   - **Plan Route** (secondary, only for today and later) and the maps button (secondary, pin icon,
     "Apple Maps" / "Google Maps"), side by side, half width each.
   - The stops, each after a leg line (as on Today, 12 in): a **stop** well (radius 16, 8
     padding): "**8:00 AM** · #1343" (number muted) with **Move…** (quiet) at the right; the customer
     (one line); the address (`link`, 15); the note (`secondary` muted: "Maintenance", "Repair",
     "With {name}", "Second tech, with {name}"); then a row of a status chip (when not Scheduled),
     a lock label, and "No map location" (`warning` footnote) as they apply. Swipe left: Move.
     Tapping the time/customer opens the job.
   - After the last stop: "{0 min} back to the shop".
   - No stops: an empty block "Nothing scheduled." (managers on an open day: "Nothing scheduled.
     Drop a job here." becomes just "Nothing scheduled." in the apps, which have no drag).
9. **Week view**: for each day Monday to Sunday, 20 apart: the day as a heading (`subHeading`,
   `link` and " · Today" for today) that opens that day; with no jobs, "Nothing scheduled" in
   `secondary` muted beside it; otherwise a grouped list: "**8:00 AM · #1343**" over "{Customer} ·
   {Tech}" (the customer in `text`), the status chip at the right, chevron, opening the job. (Week
   shows; moving is done in Day.)
10. **Month view**: a card (8 padding): weekday initials row "Mon … Sun" (`footnote` semibold
    muted); a 7-column grid, 4 apart, of day cells (min 64 tall, radius 10): the day number
    (Barlow Bold 18), "{n} jobs" (`footnote` semibold) and "{n} clean" (`footnote` muted). Days
    outside the month at 40%; today with a 2 pt `link` ring. A cell opens that day.
11. Nothing in view: "No jobs scheduled this day." / "this week." / "this month." in muted.

**Move…** opens the Move sheet (6.3). Plan Route reorders the day by driving and reports what
changed in a status line above the routes.

Data note: Plan Route, Suggest Times, moving between techs and the drive times are server actions
on the website; the apps need endpoints for them (section 10). Moving a job's day, tech or order is
a write through the sync layer; the drive times refresh when online.

### 5.7 Messages

**List.** Large title **"Messages"**. Bar: compose (if the company number is working). Subtitle
when working: "Your company number: (480) 555-0100".

1. Tip: the app's "The shop's shared inbox".
2. Notice (info) when the number isn't working: "Text and call customers from one company number
   the whole team shares. [Set Up a Number]" (managers) or "... shares. Ask an owner to set up a
   company number." (techs). Pending: "{(480) 555-0100} is being set up for texting. It usually
   takes a few days; texts and calls will appear here once it's ready."
3. One grouped list, newest first, a row per conversation (min 44, 16 side, 10 top and bottom):
   a 10 dot (`link` when unread, else empty space) 8 from the top, then the name (body; semibold
   when unread) with the time at the right (`secondary` muted: "9:41 AM", "Yesterday", "Oct 11"),
   and the last message's preview under it (`secondary` muted, one line). Swipe right: Unread /
   Read. Long press: Mark as Unread / Mark as Read.
4. Empty: "No conversations yet." in an empty block.
5. Refreshes on open, on pull, and every 20 s while showing (until push notifications exist).

**Conversation.** Large title **{person's name}** (or the number). "‹ Messages". Subtitle:
"(480) 555-0188 · [Customer Details]" or "Not a customer yet". Header actions: **Mark as Unread**
(secondary; goes back to the list) and, when the number is working, a round **Call** button
("Call {name} from the company number"; rings your phone, then connects; its result shows in a
notice under it).

- The thread, oldest at the top, the view starting at the newest:
  - A day's first message has the day above it, centered `footnote` muted ("Sunday, Oct 11").
  - Texts: bubbles, radius 20, 16 side and 8 top and bottom padding, at most 80% of the width.
    Ours on the right in `primary` with `onPrimary` text; theirs on the left in `fill` with
    `text`. Pictures above the bubble, radius 16, at most 224 tall. Under each bubble, 8 in,
    `footnote` muted: ours "{Sender} · {Delivered} · {9:41 AM}" (statuses: Sending, Sent,
    Delivered, Not delivered, Not sent; failures in `fail` with the reason), theirs the time.
  - Calls: a centered block (radius 16, `emptyFill`, `secondary`): a phone or voicemail icon and
    "{Missed call / Incoming call / Voicemail · 1 min / Call with Tony Tech · 3 min} · {time}",
    a voicemail player and its transcript in quotes when present.
  - None: "No messages yet. Send the first text below."
- **Composer**, docked at the bottom above the tab bar (above the keyboard when typing), on the
  bar material with 8 padding: a round camera button (if the number takes pictures; "Add Photos"),
  the text field (radius 22, 1 pt `controlBorder`, 16 side padding, "Text message", grows to 5
  lines), and **Send** (primary). "{2} photos attached" under it when chosen. STOP: warning notice
  "{Name} replied STOP, so texts to them are off. They can text START to turn them back on." No
  number: info notice "Texting is off until the company number is working."
- Opening it marks it read for the whole team.

**New Message.** Large title **"New Message"**, "‹ Messages". Subtitle "To {Name}, {phone}" when
started from a customer. A "To" outlined field ("Mobile number", phone keyboard) when not, then the
composer inline. Sending opens the new conversation in its place.

### 5.8 More

Large title **"More"**. Subtitle: the person's name (or email).

1. Grouped list of the sections under More (4.2): **Customers**, **Invoices**, **Chemical
   Calculator** (pool shops), **Settings** (managers). Navigation rows.
2. **YOUR ACCOUNT**: "Two-Step Sign-In" with "A code from your phone after your password" under it,
   value "On"/"Off", chevron. **Apps add**: "My Mobile Number" (value: the number or "Not set";
   used to ring you for calls from the company number), and "Company" (value: the shop's name; a
   select when the person belongs to more than one shop).
3. **ON THIS DEVICE**: "Appearance" with **Light | Dark** at the right (each at least 80 wide);
   "Directions open in" with a select (Automatic, Apple Maps, Google Maps) at the right, the value in
   `link`.
4. **SYNC** (apps only): a navigation row "Sync" with the sync message as its detail (or "All
   changes saved to the office · just now"), opening the Sync screen (6.6). A `fail` dot on the
   row when there are problems.
5. **HELP**: Help and Support (mail), Privacy Policy, Terms of Service, System Status (each opens
   the page in the in-app browser), then the action row **Show Tips Again** (`link`). Apps add a
   last row "Version {1.2.0} ({build})" (value only, no chevron).
6. **Sign Out**: its own one-row block, centered `fail` text. Asks "Sign out?" + "Changes not yet
   synced stay on this phone until you sign in again." when anything is waiting / Sign Out.
7. **Delete My Account**: a card (16 side, 6 top and bottom), a 48 tall disclosure row in `fail`
   medium. Opened: "Removes your sign-in. The jobs, reports, and invoices you worked on stay with
   the shop. If you're the shop's only owner, we'll delete the shop's data too, within 30 days."
   (muted), a field "Type DELETE to confirm", and **Delete My Account** (danger). Required by App
   Store rule 5.1.1(v).

### 5.9 Customers

Large title **"Customers"**, "‹ More".

1. Tip (pool shops, managers): "Give each pool a visit plan" / "Open a customer to set the day, how
   often, and the price per visit. Visits then appear on the schedule weeks ahead."
2. Search field "Name, phone, or email" (filters as you type).
3. Two selects side by side, labels above: **Sort** (Name A–Z, Name Z–A, Newest, Oldest, Last
   Visit, City) and **Show** (All Customers, On a Plan, No Plan (pool shops), then the customer
   kinds).
4. One grouped list: name (`bodyEmphasis`) with " · {Company}" in muted; detail: the phone (or
   "No contact details"), then the main pool's address on its own line in `text`. Value by sort:
   Last Visit "Oct 17" / "No visits"; Newest/Oldest "Added Oct 17". Chevron, opens the customer.
5. Empty: "No customers yet. They're added when a job is created on the phone." / "No customers
   here." / "No customers match “{text}”."

**Customer.** Large title **{name}**, "‹ Customers". Subtitle "{Homeowner} · {Company}".

1. Contact buttons (Call, Text, Email) with the phone (or email) in `secondary` muted after them.
2. **CONTACT**: Phone, Email (values), Other emails (detail), "Reminder and review emails" On/Off,
   Notes (detail, multi-line), and the action row "Edit Contact Details" (opens a sheet with Name,
   Type, Company, Phone, Email, Other emails, Notes, "No reminder or review emails" switch, and a
   full-width **Save**).
3. For each pool (**POOL**, or **POOL 1**, **POOL 2**): the address (semibold) as a row opening
   the "Pool Details" sheet (Street, Unit, City, State, ZIP, Pool type, Has a spa, Access notes);
   "Access notes" detail row; "Get Directions" (`link`); for pool shops the visit plans
   (`MaintenancePlans`); then **LEAK DETECTION AND REPAIRS** (or **REPAIRS**): a row per job "**Job
   #1040** · Leak detection", "{date} · {tech}", status chip; "No visits yet" when none.
4. Managers: **Delete Customer** (danger) with the footnote "Removes {name} and their pools from
   Sundeck Pro. Only possible when every job is paid or canceled; finished jobs, reports, and
   invoices are kept."

### 5.10 Invoices

Large title **"Invoices"**, "‹ More". Subtitle: "{2} open · {$750.00} owed" or "Nothing owed right
now."

1. Managers: **Export Invoices** and **Export Payments** (secondary), side by side, under the
   subtitle. In the apps each downloads the CSV and opens the share sheet.
2. Tip (managers): "Get paid online" / "Customers pay an invoice by card, Apple Pay, or bank from
   the link you send, and it's marked paid on its own." (pool shops: "Monthly billing, drafted for
   you" / "At the start of each month, Sundeck Pro drafts one invoice per customer from last month's
   finished visits. Review them, then send.").
3. Pool shops: the monthly billing block (`MonthlyBilling`: months with finished visits not yet
   billed, each with a **Bill {October}** action).
4. One grouped list, newest first: customer (`bodyEmphasis`); detail line 1 "#1026 · Job #1072" or
   "#1027 · Maintenance, October 2026"; line 2 "{Sent} · sent Oct 17, 2026 · {$375.00} due" (status
   words from `INVOICE_STATUS_LABELS`: Draft, Sent, Partly paid, Paid, Void); value: the total,
   semibold `text`, tabular; chevron. Opens the job's Wrap-Up scrolled to Invoice.
5. Empty: "No invoices yet. Create one from a job once the work is done."

### 5.11 Chemical Calculator

Large title **"Chemical Calculator"**, "‹ More" (or "‹ Job #N" when opened from a visit, which
fills the gallons and uses the pool's surface).

1. Tip (app): "Readings in, amounts out".
2. **Pool** card: "Pool" (`cardTitle`); "Gallons" field with "gal" inside at the right, placeholder
   "20,000", thousands commas as typed, max about 320 wide.
3. **Readings** card: "Readings" (`cardTitle`); a three-column grid (label | 80 wide | 80 wide), 8
   apart: column labels "READING" and "AIM FOR" right-aligned; a row per reading: "Free Chlorine
   ppm", "pH", "Alkalinity ppm", "Calcium ppm", "Stabilizer (CYA) ppm", "Salt ppm" (salt pools)
   with the unit in `secondary` muted after the name; an outlined number field for the reading and
   one for the target (placeholder = recommended level, e.g. 4, 7.5, 100, 300, 40, 3200). Under the
   grid: "Aim For starts at the recommended level. Type your own to dose to it." and, once changed,
   **Use Recommended** (`link` semibold). Then "Chlorine" and "Acid" selects (e.g. "Liquid chlorine
   12.5%", "Muriatic acid 31.45%").
4. **What to Add bar**, floating above the tab bar (12 in from the sides, 8 above it), glass,
   radius 22, at least 56 tall, 16 side padding: "WHAT TO ADD" (`footnote` semibold uppercase muted)
   over a one-line summary ("½ jug muriatic acid · 1 more"; before input "Add the gallons and a
   reading" in muted); "Show" (`link` semibold) at the right once there's a result. Tapping opens
   the **What to Add** sheet (Close on the left): the readings as outlined pills (`surface` with a 1
   pt ring at 40% of the color: `pass` "Free Chlorine 3 · OK", `warning` "pH 7.9 · High"), then the
   steps (wells, 16 padding): a 28 `primary` circle with the step number (Barlow Bold, white), the
   amount (Barlow ExtraBold 24), the product (semibold), "About {2.1 qt}" (muted, tabular), why
   (muted), a note; or "Balanced. Nothing to add." in `pass` semibold; then the saturation index
   line.

### 5.12 Settings

Managers only; techs who reach it see "Settings" and the warning notice "Settings are for owners
and admins. Ask one at {Demo Leak Co.} if something needs to change."

Large title **"Settings"**, "‹ More". Grouped lists with navigation rows, label over detail:

- **YOUR SHOP**: Company and Branding ("Shown on reports, quotes, and invoices"); Team ("Techs,
  owners, and invites"); Import Customers ("From a spreadsheet or your old software"); Scheduling
  and Routes ("Working day, shop location, and drive times"); Phone and Texting ("The company number
  for texts and calls").
- **MONEY**: Price Book ("Detection fees and repairs for quotes"; pool shops "Services, chemicals,
  and repairs for quotes"); Payments and Deposits ("How customers pay, and deposits"). (Sundeck Pro
  Billing is not in the apps, decision 12.)
- **CHECKLISTS AND REPORTS**: Checklist Components ("What every inspection checks"; pool shops
  "What every visit checks"); Test Types ("Tests techs record on the phone"); Severities ("How
  serious a finding is"); Exclusion Reasons ("Why a component wasn't inspected"); Report Templates
  ("Which reports techs can send").

The groups and their order come from `settingsGroups()` (website `components/settings-nav.tsx`),
filtered by the shop's services.

Settings pages follow two patterns:

- **List pages** (Price Book, Checklist Components, Test Types, Severities, Exclusion Reasons,
  Report Templates, Team): large title, "‹ Settings", "+" in the bar to add; rows in grouped lists,
  each opening its edit form in a sheet (Cancel, title, the fields as a grouped form, a full-width
  primary **Save**, and Delete/Turn Off at the bottom where allowed). After a sheet closes the page
  shows what happened in a success notice at the top ("Saved.", "Removed.").
- **Form pages** (Company and Branding, Scheduling and Routes, Payments and Deposits, Phone and
  Texting, Two-Step Sign-In): grouped forms with a primary **Save**.

Owner-only items show "Only the shop owner can do this." to admins, as on the website. Stripe
onboarding (Payments) and buying a number (Phone and Texting) open the website in the in-app
browser. Import Customers (spreadsheet upload) says "Import from a computer at sundeckpro.com" with
the address (a file import on a phone is out of scope).

### 5.13 Sign-in

No tab bar. The `bg` page, no card on phones:

1. The Sundeck Pro mark (`sundeck-mark.svg`, 48 x 70), centered, 32 from the top, 16 above the
   title.
2. **"Sign In"** in `largeTitle`, centered.
3. Intro, centered, muted: "New to Sundeck Pro? [Start a free trial]." (on iOS this link opens the
   website; see 8.4).
4. 24 below: a grouped form (3.14), label width 96: "Email" (name@example.com) and "Password".
5. Errors as an error notice under the form. Expired link: "That sign-in link has expired or was
   already used. Request a new one."
6. **Sign In** (primary, full width; "Signing In…"), then **Email Me a Sign-In Link Instead**
   (quiet, full width). The link mode: Email only, **Email Me a Sign-In Link**, **Use a Password
   Instead**.
7. Two-step: **"Enter Your Code"**, "Open your authenticator app and enter the 6-digit code for
   Sundeck Pro.", a one-row grouped field (one-time code keyboard, autofill), **Continue**.

Sign Up, Set Up Your Shop, the invite screen and "Sign In Again" (reauth, a sheet over the app) use
the same frame and field style.

---

## 6. Sheets and editors

### 6.1 Add Test / Edit {Test name}

Sheet. Title "Add Test" or "Edit {Pressure Test}". Fields, 16 apart:

- "Test" select (adding only; changing it clears the values).
- "Item (optional)": Whole job, then the checklist items.
- The test type's fields from its `field_schema`, one per row: numbers ("Start PSI (psi)") with a
  decimal keyboard, choices as selects ("Choose…"), long text as text areas. Calculator types
  (bucket, pressure) show their live summary in body semibold under the fields ("Dropped 2.5 psi in
  15 min").
- "Result": "Use the calculation ({Fail})" when there is one, else "Not decided"; then Pass, Fail,
  Unclear (the type's `result_options`).
- "Notes (optional)".
- **Add Test** / **Save Test** (primary).
- Editing: a hairline then **Delete Test** (danger, full width), asking "Delete this {pressure
  test}?" / Delete Test.
- Photos for the test sit in the sheet, under Notes (apps, S5).

### 6.2 Add Finding / Edit Finding

Sheet. Fields:

- "What" (placeholder "Crack at the skimmer throat").
- "Severity" select ("Choose…", then the shop's severities) and "Item (optional)" ("None", items).
- "Where (optional)" ("Two feet left of the skimmer").
- "Status": **Open | Quoted | Repaired | Monitor** (segmented).
- The pool: the shape picker (hint "Pick one so the diagram matches the pool." while none) and a
  "Has a spa" switch; both save at once and redraw the diagram.
- "Pin on the diagram (optional)" (body medium), "Tap where the leak is." (muted), the diagram
  (max 448 wide, radius 12, 1 pt `controlBorder`) with the pin in the chosen severity's color; "Pin
  placed." with **Clear Pin** (quiet), or "No pin yet."
- "Notes (optional)".
- **Add Finding** / **Save Finding** (primary); editing: **Delete Finding** (danger).
- Photos for the finding inside the sheet (apps, S5), as today.

### 6.3 Move {Customer} / Suggested Times

**Move** (sheet, medium and large detents): the address centered in `secondary` muted; a grouped
form with value-style rows (label left, control right in `link`): "Tech" (with "Nobody yet (waits in
Needs a Time)" for managers), "Day" (date, today or later), "Place in the route" ("First stop",
"After {Customer} ({9:00 AM})") when the day is loaded. Then **Move** (primary, full width) and
**Take Off Schedule** (secondary, full width; not for Needs a Time jobs).

**Suggested Times**: a grouped list of places the job fits: "{Tue, Oct 20} at {9:00 AM} · {Tony
Tech}" (semibold) over "{Adds 12 min of driving}" / "Adds no driving" (muted), each with a **Use**
quiet button. "Finding Times…" while loading.

### 6.4 Quote builder (in a draft quote's card)

- "Add From Findings" (`subHeading`): for each unrepaired finding, its title (semibold) and its
  price book suggestions as secondary buttons "+ {Item} · {$250.00}" (15 medium; "✓" once added,
  disabled) or "No price book items for this component. Add a custom line." (muted).
- "Lines" (`subHeading`): "No lines yet." or a well per line (12 padding): Description; "Qty" and
  "Price each ($)" side by side; the line total; **Remove** (quiet; asks "Remove “{line}” from the
  quote?" / Remove Line).
- "Add from the price book" select with **Add** (secondary).
- "Custom line" ("Replace skimmer lid") and "Price ($)" with **Add Line**.
- "Discount ($)" (techs up to the shop's limit; above it managers only).
- Totals (`secondary`, money right): Subtotal, Discount, Tax, **Total** (semibold), Deposit.

### 6.5 Photo viewer (apps)

Full screen over the tab bar, black background (`navy` for video letterboxing), the photo fitted
with pinch to zoom and its markup over it. Top bar (bar material over the photo): **Done** on the
left, "{Photo} · {attached to}" as the title, the share button on the right. Bottom panel (sheet
style, `bg`): caption, "{date} · location recorded", transcript for voice notes, and **Mark Up**
(secondary) and **Delete** (danger) in a row. Swiping down closes it. Existing: Swift
`MediaScreen`, Expo `jobs/[id]/media/[mediaId]`.

**Mark Up** (full-screen cover): bar with **Cancel** (left; with changes asks "Discard Changes"),
"Mark Up" title, **Save** (right, semibold `link`; "Saving…"); the photo on `navy`; under it
"Tool" Arrow | Circle | Text, "Label" field for text, the color choice (three 44 circles: Red
`#FF3B30`, Yellow `#FFD60A`, White, with a ring on the chosen one; markup colors from
`color.markup`), Undo, and "Caption (optional)".

### 6.6 Sync (apps only)

Pushed from More. Large title "Sync". Grouped rows: "Last synced" (value), "Waiting to sync"
(count), "Waiting to upload" (count); a primary **Sync Now**; when signed out **Sign In Again**.
"CHANGES THAT COULD NOT BE SAVED": a row per problem with its reason and **Discard This Change**
(danger, asks). "THIS PHONE": Device ID, Local data size. (Moves the existing Settings content of
both apps here.)

### 6.7 Signature and Review and Sign (apps)

Unchanged in purpose (S6). Restyle only: full screen without the tab bar, `bg` page, the report or
consent text in a card, the pad as a white block (radius 12, 1 pt `controlBorder`, 200 tall) with
"Use your finger." under it and **Clear** (quiet); **Sign and Finish** (primary, full width).

---

## 7. Mapping to the existing code

"Replace" means rebuild the screen to this spec; "change" means restyle and move parts. Swift
milestones from `docs/plans/swift-app.md`: S3 to S6 are built; **S7** quotes and invoices; **S8**
everything else. The Expo app has no milestones; its column says what exists.

### 7.1 Shared building blocks

| Spec | Swift | Expo |
|---|---|---|
| Fonts, colors, radii (2) | `UI/Theme.swift`, `SundeckTokens` (change: add the type roles, `sectionLabel`, card shadow, tints) | `ui/theme.ts` (change: same) |
| Navigation bar, large title (3.1) | per screen `.navigationTitle` + one appearance setup in `SundeckProApp.swift` (change) | `ui/navigation.ts` (change: Android custom header, iOS large titles everywhere) |
| Tab bar (3.2) | `UI/AppTabs.swift` `MainView` (change: icons, badge, remove sheet New Job) | new `app/(app)/(tabs)/_layout.tsx` + new `ui/TabBar.tsx` |
| Buttons (3.7) | `Theme.swift` `PrimaryButtonStyle`, `SecondaryButtonStyle` (change: size to label, 44 tall, add danger and quiet) | `ui/components.tsx` `Button` (change) |
| Status chip (3.6) | `Theme.swift` `StatusChip`, `UI/OutcomeChip.swift` (replace: solid) | `ui/components.tsx` `StatusChip`, `Pill`, `features/inspection/OutcomeChip.tsx`, `JOB_STATUS_COLOR` (replace) |
| Notice (3.12) | `Theme.swift` `Notice` (replace: bar, no icon) | `ui/components.tsx` `Notice` (change) |
| Segmented (3.9) | new `UI/Segmented.swift` (replaces `.pickerStyle(.segmented)` uses) | `ui/components.tsx` `Segmented` (change to the spec's look) |
| Pills (3.8), round buttons (3.10) | new `UI/Pills.swift`; `Theme.swift` `RoundIconButton` (change: 10% tint) | new in `ui/components.tsx` |
| Tips (3.11) | `UI/JobsView.swift` `TipRow` (replace with a card) | `ui/Tip.tsx` (change) |
| Grouped list, rows (3.4) | `List(.insetGrouped)` + new `UI/Grouped.swift` | `ui/components.tsx` `Group`, `ListRow`, `Section` (change) |
| Fields, selects (3.14) | per form (change: outlined fields, menus) | `Field`, `Choice`, `PickerRow`, `FieldGroup`, `FieldRow` (change) |
| Sheets, action sheets (3.15) | `.sheet`, `.confirmationDialog` (change: title bar, detents, colors) | `ui/sheet.tsx`, `ui/confirm.ts` (change; Android drawn action sheet) |
| Swipe rows (3.16) | `.swipeActions` | `ui/SwipeRow.tsx` (keep) |
| Sync bar (3.17) | `UI/JobsView.swift` `SyncBarRow` (change: capsule) | `ui/SyncBar.tsx` (change) |
| Empty state (3.13) | new | new in `ui/components.tsx` |
| Pool diagram, shape picker (3.18) | `UI/PoolDiagram.swift` (keep, recolor) | `ui/PoolDiagram.tsx`, `ui/ShapePicker.tsx` (keep) |
| Brand header on sign-in | `UI/AuthViews.swift` | `ui/BrandHeader.tsx` (`AuthTitle`) |

### 7.2 Screens

| Screen (spec) | Swift today | Swift work | Expo today | Expo work |
|---|---|---|---|---|
| Tabs (4) | `AppTabs.swift` `MainView`, tabs exist with SF Symbols | Change (icons, badge, New Job push) | None: one stack, Jobs is `app/(app)/index.tsx` | New `(tabs)` layout; shared routes (8.2) |
| Today (5.1) | `AppTabs.swift` `TodayView` (today's jobs list) | Replace; stop cards, legs, On My Way, whose day, Getting Started, weather: **S8** | None | New `(tabs)/(today)/index.tsx` |
| Jobs (5.2) | `UI/JobsView.swift` `JobsView`, `JobRow` (sections by day) | Replace: segmented, filter pills, search, rows (S8 for filters; rows now) | `app/(app)/index.tsx` | Move to `(tabs)/(jobs)/index.tsx`, replace |
| Reports (5.3) | None | New, **S8** | None | New (segment in the Jobs screen) |
| Job page shell, header, switcher (5.4) | `UI/JobScreen.swift` (fee and notes at top, Picker Checklist/Tests/Findings/Report/Quote, media below) | Change to five sections | `app/(app)/jobs/[id]/index.tsx` (Segmented Checklist/Tests/Findings/Report/Quote) | Change to five sections |
| Details (5.4) | Parts in `JobScreen.swift` (fee, location marked, notes, status actions) | Change; customer, contact row, pool, assigned, intake: now; messages group, customer links, schedule, timeline: **S8** | Parts in `jobs/[id]/index.tsx` | Change; new groups |
| Checklist (5.4) | `UI/ChecklistTab.swift`, `UI/ComponentScreen.swift`, `Model/ChecklistModel.swift` | Change: section blocks with summary, verdict pill menus, Where field, Mark Remaining, Add an item | `features/inspection/ChecklistTab.tsx`, `jobs/[id]/component/[componentId].tsx` | Change, same |
| Findings: Tests + Findings (5.4) | `UI/TestsTab.swift`, `UI/FindingsTab.swift` | Change: one section, diagram above findings list | `features/inspection/TestsTab.tsx`, `FindingsTab.tsx` | Change, same |
| Test sheet (6.1) | `UI/TestEditor.swift` | Change (sheet bar, fields, Delete) | `jobs/[id]/(edit)/test/[testId].tsx` | Change |
| Finding sheet (6.2) | `UI/FindingEditor.swift` | Change | `jobs/[id]/(edit)/finding/[findingId].tsx` | Change |
| Photos (5.4) | `UI/MediaSection.swift` ("All Photos and Notes" under the tabs), `VoiceRecorder.swift`, `CameraPicker.swift` | Change into its own section: capture card with tiles, cards per item | `features/media/MediaSection.tsx`, `VoiceRecorder.tsx`, `(edit)/capture/[mediaId].tsx` | Change, same |
| Photo viewer, Mark Up (6.5) | `UI/MediaScreen.swift`, `UI/MarkupEditor.swift`, `MarkupLayer.swift` | Change (restyle) | `jobs/[id]/media/[mediaId].tsx`, `ui/MarkupLayer.tsx` | Change |
| Wrap-Up: report (5.4) | `UI/ReportTab.swift`, `Model/ReportModel.swift` | Change into a card (Show/Hide Draft, versions) | `features/report/ReportTab.tsx` | Change |
| Wrap-Up: signatures (5.4), Signature, Review (6.7) | `UI/SignatureScreen.swift`, `UI/ReviewScreen.swift`, `UI/SignaturePad.swift` | Change (section list of signatures; restyle screens) | `jobs/[id]/signature.tsx`, `jobs/[id]/review.tsx`, `ui/SignaturePad.tsx` | Change |
| Wrap-Up: quotes, builder (5.4, 6.4) | None ("coming in" placeholder in `JobScreen`) | New, **S7** | `features/quote/QuoteTab.tsx` | Change into Wrap-Up |
| Wrap-Up: invoice (5.4) | None | New, **S7** | `features/invoice/InvoiceSection.tsx` | Change into Wrap-Up |
| New Job (5.5) | `UI/NewJobView.swift`, `Model/NewJobForm.swift` (a sheet) | Change: pushed screen, cards, segmented; Suggest Times and plans: **S8** | `app/(app)/jobs/new.tsx` (modal on iPhone) | Change: push |
| Schedule (5.6), Move, Suggested Times (6.3) | `AppTabs.swift` `ScheduleTab` (placeholder) | New, **S8** | None | New `(tabs)/(schedule)/index.tsx` |
| Messages list, conversation, new (5.7) | `AppTabs.swift` `MessagesTab` (placeholder) | New, **S8** | `app/(app)/messages/index.tsx`, `[id].tsx`, `new.tsx` | Move under the tab, change |
| More (5.8), Sync (6.6) | `AppTabs.swift` `MoreView` → `UI/SettingsView.swift` | Replace More; move account/sync parts into More and Sync: now; Appearance, Directions: **S8** | `app/(app)/settings.tsx` | Replace with `(tabs)/(more)/index.tsx` and `more/sync.tsx` |
| Two-Step Sign-In | in `SettingsView.swift` | Change (own pushed screen) | in `settings.tsx` | Change |
| Customers, Customer (5.9) | None | New, **S8** | None | New |
| Invoices (5.10) | None | New, **S7** | None | New |
| Chemical Calculator (5.11) | None | New, **S8** | `app/(app)/chemicals.tsx` | Change (bar + sheet) |
| Settings (5.12) | None (app settings only) | New, **S8** (index and list pages first; see 10.4) | None | New |
| Sign-in and the rest (5.13) | `UI/AuthViews.swift` (`SignInView`, `SignUpView`, `CodeView`, `SetupView`, `ReauthView`) | Change (restyle) | `app/(auth)/sign-in.tsx`, `sign-up.tsx`, `app/code.tsx`, `app/setup.tsx`, `app/(app)/reauth.tsx` | Change |
| Welcome cards | `SettingsView.swift` `WelcomeView` | Keep (app-only first-launch sheet) | `app/(app)/welcome.tsx` | Keep |

---

## 8. Platform notes

### 8.1 Swift (iOS 18 and later)

- **Tabs:** `TabView(selection:)` with `Tab(_:image:value:)`. On iOS 26 and later this is the
  floating Liquid Glass tab bar, the thing the website imitates; don't add a custom bar. On iOS 26
  turn on `.tabBarMinimizeBehavior(.onScrollDown)` (owner, 2026-10-19: Liquid Glass and motion). Each tab owns a
  `NavigationStack(path:)` (already so in `MainView`).
- **Large titles in Barlow:** `UINavigationBarAppearance` set once at launch, for both standard and
  scroll-edge appearances: `largeTitleTextAttributes` Barlow ExtraBold 34 (scaled with
  `UIFontMetrics(forTextStyle: .largeTitle)`) in `text`; `titleTextAttributes` system semibold 17 in
  `text`; `configureWithTransparentBackground()` for scroll-edge (the page shows through), and the
  default (glass on iOS 26, blur before) once scrolled. Bar button tint `link`. On iOS 26 the bar
  draws its own scroll edge effect; keep it.
- **The pinned section switcher:** the job page is a `ScrollView` with `LazyVStack(pinnedViews:
  [.sectionHeaders])`; the header (status, type, date, actions) is a normal row, the switcher is the
  section's header, drawn on `.bar` material (iOS 26: `.glassEffect(.regular, in: .rect)`) with a
  0.5 hairline below once pinned.
- **Lists and swipes:** `List(.insetGrouped)` for list screens (Jobs, More, Settings, Customers,
  Invoices, Messages, Reports, Details' groups if simpler); `.swipeActions(edge: .trailing)` with a
  destructive Delete; `.contextMenu` for Mark as Unread.
- **Menus for selects and verdicts:** `Menu` with a custom label drawn as the outlined field or the
  verdict pill.
- **Sheets:** `.sheet` + `.presentationDetents`, `.presentationDragIndicator(.visible)`,
  `.presentationBackground(Color(Tokens.Role.bg))`, `.interactiveDismissDisabled(dirty)`.
  Confirmations: `.confirmationDialog(titleVisibility: .visible)`.
- **Glass on our own floating views** (What to Add bar): `.glassEffect()` on iOS 26, else
  `.regularMaterial` in a capsule with the 1 pt border and shadow.
- **Appearance:** `.preferredColorScheme(.light)` by default, `.dark` when chosen in More. Colors
  come from `Color(TokenRole)` (already dynamic).
- **Haptics:** `.sensoryFeedback`.
- **In-app browser:** `SFSafariViewController` for the help pages, Stripe onboarding, report and PDF
  links.
- **Dynamic Type:** test at AX5; rows stack their value under the label when it doesn't fit.

### 8.2 Expo (Android, and iPhone until the switch-over)

- **Tabs:** Expo Router `Tabs` with a custom `tabBar` component (`ui/TabBar.tsx`) that draws the
  website's floating capsule on both platforms: absolutely positioned, `left/right` 12, `bottom`
  `max(12, insets.bottom)`, radius 28, glass per 2.5 (BlurView on iOS, solid on Android), five
  `Pressable`s with the website's SVG icons from `react-native-svg` (outline and filled paths from
  `apps/web/src/components/nav-links.tsx`), label 11 medium, the Messages badge. Pressing the
  current tab pops to the root (`navigation.popToTop`) and a second press scrolls to the top. Set
  `tabBarStyle: { position: "absolute" }` semantics so content scrolls under it and add 128 bottom
  padding to scroll views. (Expo Router's native tabs, `expo-router/unstable-native-tabs`, would
  give iOS 26's real Liquid Glass bar, but its icons must be SF Symbols and Android's version is a
  Material bar; one drawn bar keeps Android and iPhone identical. The Swift app supplies the real
  glass bar on iPhone.)
- **Routes:** `app/(app)/(tabs)/_layout.tsx` with groups `(today)`, `(jobs)`, `(schedule)`,
  `(messages)`, `(more)`, each a `Stack`. Screens reachable from several tabs (the job page and its
  children, a customer, a conversation, New Job) live once as shared routes:
  `app/(app)/(tabs)/(today,jobs,schedule,messages,more)/jobs/[id]/...`, so pushing a job from Today
  keeps the Today tab. Sign-in stays outside the tabs. Test and Finding stay modal routes over the
  tabs.
- **Headers:** iPhone: native-stack large titles in Barlow (3.1). Android: the custom header in
  3.1 (back chevron and the previous title, not the arrow; the system back gesture and button still
  go back).
- **Android specifics:** body in Public Sans (already `face`); ripple (`android_ripple` with `text`
  at 10%) on rows and buttons in place of the pressed fill; Material date and time pickers; the
  edge-to-edge window (the tab bar sits above the gesture bar inset); status bar icons dark in
  light mode. Everything else (pills, segmented, sheets, action sheets drawn as panels, switches in
  the iOS shape) follows the spec, decision 2. The navy Android app bar and floating New Job button
  are removed.
- **Packages:** `expo-blur` for glass on iOS (`npx expo install expo-blur` in `apps/mobile`).
  Nothing else new; `react-native-svg`, `react-native-reanimated` and `react-native-gesture-handler`
  are already in.

### 8.3 Where Android differs from iPhone

Only these, in both the Expo app and any future Android app:

1. Body face: Public Sans (the website on Android shows the same).
2. Back: system gesture and button too; the header still shows "‹ {previous}".
3. Touch feedback: ripple instead of a pressed fill.
4. Pickers: Material date and time dialogs; selects open a dropdown menu.
5. Glass: solid surfaces (no blur), with the same border and an elevation shadow.
6. No haptics where the device has none.

### 8.4 Store rules that change what the apps show

- **No buying in the apps.** Sundeck Pro Billing (subscribe, Manage Billing) is left out of the
  apps' Settings (decision 12); Apple's 3.1.1 and Google Play's payments policy treat a subscription
  bought in an app as an in-app purchase. "Start a free trial" on sign-in opens the website.
  Customer payments (quote deposits, invoices) are paid by the shop's customers on the website's
  customer pages and are fine.
- **Account deletion** stays in More (Apple 5.1.1(v); Google Play's account deletion rule).
- **Permission wording** for camera, microphone, photos and location stays as it is in both apps.

---

## 9. What the apps must not copy from the website

| On the website | Why | In the apps |
|---|---|---|
| A **Search** button beside the search field; pagination with **Show More** | The website asks the server per search and page | Filter as you type from the phone's database; lazy lists |
| The job section in the **URL hash** (`#checklist`), `?list=1`, `?tech=`, `?view=` | Browser history and links | Remember the section and choices in view state |
| **Auto-refresh** by reloading the page every 10 to 20 s | Server-rendered pages | Sync on open, pull to refresh, the sync service; Messages polls its API until push exists |
| Hover styles, **right-click** menus, keyboard shortcuts (Enter to send) | Mouse and keyboard | Long-press context menus; the keyboard's Send/return key |
| The **cookie** for "Directions open in"; the `/maps` redirect page | Browser | A device setting; open Apple Maps or Google Maps directly |
| **Download** links for CSV exports and PDFs; links that open in a new tab | Browser | Share sheet for files; `SFSafariViewController` / Custom Tabs for web pages |
| **Desktop layouts** (two columns, tables, the Stripe-style header, the settings sidebar, the Getting Started corner panel, Messages' three columns, drag and drop on the schedule with grips) | Wider screens | Only the phone layout in this spec |
| **Dashboard** | Built for a computer | Not in the apps (decision 12) |
| The "**Skip to Content**" link, focus outlines for mouse users | Browser accessibility | VoiceOver / TalkBack order and the system focus |
| Tips that mention computers ("right-click it on a computer") | Browser wording | The `platform: "app"` tips |
| `<select>` drawn by the browser, `mm/dd/yyyy` date boxes, the 09:00 time box | Browser controls | Native menus and pickers styled as the outlined field |
| The Today **weather** and **drive times** coming from the page's server | Server-rendered | Fetched from an API when online; hidden offline (section 10) |
| **Bugs:** selected filter pill white on light blue in dark mode; "1 attention" shown green; the Timeline's "what" cut to "Status: Q…"; Invoices rows linking to `#invoice` (which opens Details, not Wrap-Up); Customers, Invoices and Chemicals having no "‹ More" back link on phones; two filled buttons at once on Wrap-Up when there is no draft (Write Draft and Send by Email) | Small website faults | Fixed as described in 1.9, 1.10, 5.4 (Timeline wraps), 5.10, 4.5. For the two filled buttons, the apps keep only Write Draft filled until a draft exists. Worth fixing on the website too |
| The navy logo bar and Sundeck Pro logo in the header | Wider screens only | No logo in app chrome; the mark only on sign-in |

---

## 10. Open questions

1. **Confirm decision 2** (Android follows the website, not its own look). If confirmed, CLAUDE.md's
   "the app's Android build keeps its own look" and the 2026-10-14 decision are replaced in
   DECISIONS.md.
2. **The Expo app now gets screens it never had** (Today's route, Schedule, Customers, Invoices,
   Settings, Reports). The approved Swift plan (decision 7) says the Expo app gets fixes but no new
   features. Since the Expo app is the Google Play app, it needs these screens; the order can follow
   the Swift milestones (shell and job page first, S7 money, then S8). This needs the owner's go,
   and probably a short Android plan.
3. **Server endpoints the native screens need.** The Swift plan says no server change is planned
   and to raise one first. The website does these in server components and actions, which the apps
   can't call. Read-only and small:
   - `GET /api/routes?date=&tech=` (or by range): the route days with drive times, legs, "back by",
     overtime, lock reasons and directions (Today, Schedule).
   - `POST /api/routes/plan` (Plan Route), `GET /api/routes/suggest?job=` (Suggest Times).
   - `GET /api/weather` (the shop's weather for Today).
   - `GET /api/jobs/{id}/links` (customer links with open counts) and `POST` to turn one off.
   - `GET /api/jobs/{id}/timeline` (managers).
   - Messages, reports, quotes, invoices and texting already have endpoints the Expo app uses.
4. **Settings in the apps:** which pages to build natively first. Recommended: the index and the
   list pages techs' work depends on (Price Book, Checklist Components, Test Types, Severities,
   Exclusion Reasons, Team), then Company and Branding and Scheduling. Payments (Stripe
   onboarding) and Phone and Texting (buying a number) open the website in the in-app browser;
   Import Customers stays on the computer.
5. **Dashboard** left out of the apps (decision 12): confirm, or add it as a website page in the
   in-app browser.
6. **Appearance default:** the apps start in Light even when the phone is in dark mode, as the
   website does (`apps/web/src/lib/theme.ts`: dark only when chosen) and as the field rule says.
   Confirm, or add "Automatic" to the Light | Dark choice on both.
