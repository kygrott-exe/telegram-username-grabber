# Telegram Username Claimer — Worker

This is the local Python worker that actually claims Telegram usernames.
It runs on **your** machine using **your** Telegram user account.

## Why a separate worker?

Telegram **bots cannot claim/create channel usernames**. Only a user account
(MTProto) can. This worker signs in as you via Telethon, polls the Lovable
app for pending jobs, and executes them.

## Setup (once)

1. **Get Telegram API credentials**
   - Go to <https://my.telegram.org> → "API development tools"
   - Log in with your phone, create an app, copy `api_id` and `api_hash`.

2. **Install Python deps**
   ```bash
   cd worker
   python3 -m venv .venv
   source .venv/bin/activate       # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure env**
   ```bash
   cp .env.example .env
   # then edit .env — see notes below
   ```

   - `APP_BASE_URL`: your Lovable app URL (published or preview).
   - `WORKER_TOKEN`: open your project in Lovable → Cloud → Secrets and copy
     the value of `WORKER_TOKEN`. This is the shared secret the app uses to
     authenticate the worker.
   - `TG_API_ID` / `TG_API_HASH`: from step 1.

4. **First run — Telegram will ask for your phone number and login code**
   ```bash
   set -a && source .env && set +a
   python telegram_worker.py
   ```
   You'll be prompted for your phone (in +country format), then the code
   Telegram sends you, then your 2FA password if you have one. A
   `claimer.session` file is created so subsequent runs are non-interactive.

## Running

```bash
set -a && source .env && set +a
python telegram_worker.py
```

Leave it running. Any job you queue in the web UI will be picked up within
`POLL_INTERVAL` seconds. The worker will:

1. Create a new public channel with the title + description
2. Set the username you asked for
3. Upload the profile photo (if `pfp_url` was provided)
4. Post the invite link + result back to the web UI

## Notes / limits

- **One-shot**: each job is attempted once. If the username is already
  taken, the job is marked `failed` — the empty channel is still created
  under your account, so delete it manually if you don't want it.
- **Public channel cap**: Telegram user accounts can only own a limited
  number of public channels (~10). Free some up if you hit
  `ChannelsAdminPublicTooMuchError`.
- **Fragment usernames**: some short usernames can only be bought on
  Fragment — those will fail with a clear message.
- **Flood waits**: Telegram rate-limits channel creation and username
  changes. Don't hammer it.
- **Session file security**: `claimer.session` is a fully authenticated
  Telegram login. Keep it private, don't commit it, don't share it.
