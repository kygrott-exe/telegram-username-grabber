# Telegram Username Claimer — Worker

Local Python worker that drives Telegram logins and claims usernames on behalf
of the web app.

## What it does

- **Login flow**: when a user connects a Telegram account in the web UI, the
  worker picks up the request, sends the login code, forwards a 2FA prompt
  if needed, and reports the resulting session back to the web app (which
  encrypts and stores it).
- **Claim flow**: for each queued claim job, the worker signs in with the
  attached account's session, creates a public channel, claims the
  username, sets the profile photo, and reports the result.

## Setup (once)

1. **Get Telegram API credentials** — <https://my.telegram.org> → *API
   development tools*. This is a single app/keypair used for all
   users of this deployment; each end user only supplies phone + code.

2. **Install deps**
   ```bash
   cd worker
   python3 -m venv .venv
   source .venv/bin/activate      # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure env**
   ```bash
   cp .env.example .env
   # then edit .env — see notes below
   ```
   - `APP_BASE_URL`: your published Lovable app URL.
   - `WORKER_TOKEN`: from Lovable Cloud → Secrets.
   - `TG_API_ID` / `TG_API_HASH`: from step 1.

## Running

```bash
set -a && source .env && set +a
python telegram_worker.py
```

Leave it running. As soon as a user connects an account in the web UI or
queues a claim job, the worker picks it up.

## Notes

- **Interactive login lives in memory**: the `TelegramClient` for a
  half-finished login is kept in the worker process between the code
  and 2FA steps. If you restart the worker while a user is mid-flow,
  they need to start the connect flow again. Completed accounts survive
  restarts because their session is stored (encrypted) in the database.
- **Session encryption**: the web app encrypts each Telegram session with
  `TG_SESSION_KEY` before storing it. The worker never sees the key —
  the web app decrypts on demand and hands the session string to the
  worker with each job.
- **Public channel cap**: Telegram limits how many public channels one
  account can own. Free some up if you hit `ChannelsAdminPublicTooMuchError`.
- **Fragment usernames**: some short usernames can only be bought on
  Fragment — the job fails with a clear message in that case.
