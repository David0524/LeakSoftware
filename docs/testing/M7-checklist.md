# M7 checklist: reports, signatures, sending

## What works today, with no keys

Run the website on your computer (as in the M6 checklist) and sign in as
`owner@demo.leakbook.test` / `leakbook-demo`.

1. **Write a draft.** Open the **Sam Sample** job (Jobs → All). Under **Reports → Homeowner
   report**, press **Write Draft**. Without an AI key the draft is a plain summary of the job.
2. **Edit.** Change a sentence, press **Save Text**.
3. **Send by Text.** Press **Send by Text**. Copy the message and open the link in a private
   window: the report in the shop's colors, the findings with the pool diagram, what was and
   wasn't inspected, and **Download PDF**.
4. **New version.** Write the draft again and send it. The old link now says the report was
   updated and points to the new one.
5. **Partner report.** Same steps under **Partner report**: a technical version with the test
   table.

On the phone (needs `EXPO_PUBLIC_API_URL`, see below):

6. **Signature.** Job → **Report** tab → **Add Signature**. Pick the purpose, sign with a finger,
   **Save Signature**. Works in airplane mode; it uploads when signal returns.
7. **Draft and send from the phone.** **Write Draft**, edit a section, **Send by Text** opens the
   share sheet with the link.

## Turning on the rest

These are one-time setup steps. Put keys in the hosting settings, never in chat or the repo.

| What | Where to get it | Setting |
| --- | --- | --- |
| Host the website | vercel.com: import the GitHub repo, root `apps/web` | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (from `config/supabase-dev.json`), `APP_BASE_URL` = the site's URL |
| AI-written reports | console.anthropic.com → API keys | `ANTHROPIC_API_KEY` |
| Email | resend.com → add and verify a sending domain (DNS records), then an API key | `RESEND_API_KEY`, `EMAIL_FROM_DOMAIN` |
| Save PDFs once instead of re-printing | Supabase dashboard → Project Settings → API → service_role key | `SUPABASE_SERVICE_ROLE_KEY` |
| Phone talks to the website | the Vercel URL | `EXPO_PUBLIC_API_URL` in the app's build settings |

After that, **Send by Email** delivers the report with the PDF attached.
