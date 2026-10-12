# M5 device checklist: photos, video, voice notes

Setup is the same as `M3-device-checklist.md`. Pull the latest code first:

```sh
git pull
corepack pnpm install
cd apps/mobile
npx expo start --lan
```

Sign in as `tech@demo.leakbook.test` / `leakbook-demo`. The first photo asks for camera and
location access, and the first voice note asks for the microphone. Allow all three (location is
optional; photos still save without it).

1. **Photo on a component.** Open a job → Checklist → Return 1. Under **Photos and Notes**, tap
   **Photo**, take a picture. A thumbnail appears with a small cloud badge, which goes away
   within a few seconds once it uploads.
2. **Photo on a finding.** Open a finding (or save a new one first) and add a photo the same way.
   On a brand-new finding the section says to save first.
3. **Video.** On the job, tap **Video**, record about 10 seconds. The thumbnail shows a camera
   icon and the length. Open it and play it.
4. **Voice note.** Tap **Voice Note**. It starts recording right away; talk for a few seconds,
   then **Stop and Save**. Open it and play it back. The transcript says "Not transcribed yet"
   (transcription starts once the website is deployed).
5. **Markup.** Open a photo → **Mark Up**. Drag to draw an arrow, switch to **Circle** and drag
   around something, switch to **Text**, type "Crack", tap the photo. Try **Undo**. Pick another
   color. **Save Markup**. The thumbnail shows the markup too.
6. **Original unchanged.** Open the photo again → **Edit Markup** → **Clear All** → **Save
   Markup**. The photo is back exactly as taken.
7. **Details.** On a photo, check Captured time, Location (if allowed), Size (2048 on the long
   side), Upload "Uploaded", and the SHA-256 fingerprint.
8. **Offline batch.** Turn on airplane mode. Take about 10 photos and one 30-second video across a
   couple of components. The sync bar reads "Offline · … photos saved on this phone" (or
   "files" when a video is included). Everything shows and opens while offline.
9. **Kill mid-upload.** Turn airplane mode off and, while the sync bar still says files are
   waiting, swipe the app away. Reopen it. Uploads continue and the bar returns to "All changes
   saved to the office". In Settings, **Waiting to upload** is 0.
10. **Other phone or account.** Sign out (it warns if anything has not uploaded), sign in as
    `owner@demo.leakbook.test`. The photos, video, voice note, and markup are all there
    (they download, so this needs a connection).

Report anything slow, hard to tap with one hand, or confusing. Note the video quality: it is set
to the camera's medium preset for now to stay under the 50 MB upload limit (see DECISIONS).
