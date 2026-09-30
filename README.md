# Ghar ka Hisaab

A household expense diary you can talk to, in Hindi, English or a mix of both. Say "aloo pyaaz 40 aur dhaniya 10 kal" and it adds the entries. You check them on a card before they are saved.

It is an installable web app (PWA) with no framework, no bundler and no dependencies.

## What it does

- Takes voice or typed input. Hindi is the default, and one tap switches to English.
- Uses an AI model to turn a sentence into entries with amount, category, note and day.
- Falls back to simple local rules if the AI is slow, offline or over its daily limit. The rules understand digits, Devanagari digits, words like "sau" and "hazaar", and "kal" / "parso".
- Answers questions out loud, like "sabzi pe kitna gaya".
- Writes a short monthly summary in Hinglish. The totals are calculated in code, and the AI only puts them into words.
- Keeps each person's data separate. Sign in with email and password, and delete your account and data any time.

## Built with

Vanilla JS, Supabase (Postgres, Auth, Edge Functions), OpenRouter (`openai/gpt-4.1-mini`), the Web Speech API and a service worker.

## Setup

1. In the Supabase SQL Editor, run `supabase/schema.sql`. It is safe to run again.
2. In Supabase under Authentication, turn on Email sign-in with Confirm email enabled, and set the Site URL to wherever you host the app.
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and anon key. Then run `npm run config`, which creates `src/config.js` (git-ignored). Both values are public by design, since row-level security is what protects the data. On Netlify or Vercel, set the same variables in the dashboard and use `npm run config` as the build command.
4. Optional, for AI parsing: deploy the Edge Function.
   ```
   supabase link --project-ref YOUR-PROJECT-REF
   supabase secrets set OPENROUTER_API_KEY=sk-or-...
   supabase functions deploy analyze
   ```
   To turn AI off, set `AI_ENABLED=false` in `.env.local`.
5. Host the folder over HTTPS (the microphone needs it). To try it locally, run `npm start`.
6. Open the link, create an account, and on Android use Chrome menu > Add to Home screen.

Supabase's built-in email sender is limited to a few emails an hour, so add your own SMTP before real users sign up.

## Keeping AI use in check

- The OpenRouter key lives in Supabase as a secret and never reaches the browser.
- The function needs a signed-in user and has daily limits: `AI_DAILY_LIMIT` per person (default 60) and `AI_GLOBAL_DAILY_LIMIT` for everyone (default 3000). Past a limit, the app uses the local rules.
- Never put the `service_role` key in `.env.local` or any client file.

## Folders

```
index.html, css/            page and styles
manifest.webmanifest, sw.js PWA manifest and offline cache
scripts/                    builds src/config.js from .env.local
src/                        app code (services, parser, ui)
supabase/                   schema.sql and the analyze Edge Function
tests/                      npm test (needs Node 22.18+)
```

## Good to know

- Dates and the daily AI reset use India time (`Asia/Kolkata`). Change it in the schema for other regions.
- All users share one category list. Edit the `categories` table to change it, and edit a category's `description` to teach the AI new words.
- Add a privacy policy before opening it to the public.
