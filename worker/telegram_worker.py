#!/usr/bin/env python3
"""
Telegram username claimer worker.

Polls the Lovable app for pending claim jobs, then uses your Telegram
USER account (MTProto via Telethon) to:
  1. Create a new channel with the given title and description
  2. Set its public username
  3. Set its profile photo (if pfp_url is provided)
  4. Report success/failure back to the app

Requirements:
  pip install telethon requests

Environment variables (see .env.example):
  APP_BASE_URL       e.g. https://project--<id>.lovable.app
  WORKER_TOKEN       shared bearer token (copy from Lovable Cloud secrets)
  TG_API_ID          from https://my.telegram.org
  TG_API_HASH        from https://my.telegram.org
  TG_SESSION_NAME    e.g. "claimer" (session file name, no extension)
  POLL_INTERVAL      seconds between polls (default 5)
"""
import os
import sys
import time
import tempfile
import traceback

import requests
from telethon.sync import TelegramClient
from telethon.tl.functions.channels import (
    CreateChannelRequest,
    UpdateUsernameRequest,
    EditPhotoRequest,
)
from telethon.tl.functions.messages import ExportChatInviteRequest
from telethon.tl.types import InputChatUploadedPhoto
from telethon.errors import (
    UsernameOccupiedError,
    UsernameInvalidError,
    UsernamePurchaseAvailableError,
    ChannelsAdminPublicTooMuchError,
    FloodWaitError,
)


APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
WORKER_TOKEN = os.environ["WORKER_TOKEN"]
API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
SESSION = os.environ.get("TG_SESSION_NAME", "claimer")
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))

HEADERS = {
    "Authorization": f"Bearer {WORKER_TOKEN}",
    "Content-Type": "application/json",
}


def fetch_job():
    r = requests.post(f"{APP_BASE_URL}/api/public/worker/next-job",
                      headers=HEADERS, json={}, timeout=15)
    r.raise_for_status()
    return r.json().get("job")


def report(job_id, status, message="", channel_id=None, invite_link=None):
    payload = {"id": job_id, "status": status, "result_message": message[:1900]}
    if channel_id:
        payload["channel_id"] = str(channel_id)
    if invite_link:
        payload["invite_link"] = invite_link
    r = requests.post(f"{APP_BASE_URL}/api/public/worker/complete",
                      headers=HEADERS, json=payload, timeout=15)
    if not r.ok:
        print(f"[WARN] report failed: {r.status_code} {r.text}", file=sys.stderr)


def download_pfp(url: str) -> str | None:
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        suffix = ".jpg"
        ct = r.headers.get("content-type", "").lower()
        if "png" in ct:
            suffix = ".png"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(r.content)
        return path
    except Exception as e:
        print(f"[WARN] pfp download failed: {e}", file=sys.stderr)
        return None


def process_job(client: TelegramClient, job: dict):
    job_id = job["id"]
    username = job["username"].lstrip("@")
    title = job["channel_title"]
    about = job.get("channel_description") or ""
    pfp_url = job.get("pfp_url")

    print(f"[JOB] {job_id} -> @{username} \"{title}\"")

    # 1. Create channel
    try:
        result = client(CreateChannelRequest(
            title=title,
            about=about,
            megagroup=False,
            broadcast=True,
        ))
    except FloodWaitError as e:
        report(job_id, "failed", f"FloodWait creating channel: {e.seconds}s")
        return
    except Exception as e:
        report(job_id, "failed", f"CreateChannel error: {e}")
        return

    channel = result.chats[0]
    print(f"  created channel id={channel.id}")

    # 2. Claim username
    try:
        ok = client(UpdateUsernameRequest(channel=channel, username=username))
        if not ok:
            report(job_id, "failed", "Telegram returned False on UpdateUsername",
                   channel_id=channel.id)
            return
    except UsernameOccupiedError:
        report(job_id, "failed", f"@{username} is already taken",
               channel_id=channel.id)
        return
    except UsernameInvalidError:
        report(job_id, "failed", f"@{username} is invalid",
               channel_id=channel.id)
        return
    except UsernamePurchaseAvailableError:
        report(job_id, "failed",
               f"@{username} is only available for purchase on Fragment",
               channel_id=channel.id)
        return
    except ChannelsAdminPublicTooMuchError:
        report(job_id, "failed",
               "Your account owns too many public channels. Free one first.",
               channel_id=channel.id)
        return
    except FloodWaitError as e:
        report(job_id, "failed", f"FloodWait on username: {e.seconds}s",
               channel_id=channel.id)
        return
    except Exception as e:
        report(job_id, "failed", f"UpdateUsername error: {e}",
               channel_id=channel.id)
        return

    print(f"  claimed @{username}")

    # 3. Profile photo (best-effort, non-fatal)
    photo_note = ""
    if pfp_url:
        path = download_pfp(pfp_url)
        if path:
            try:
                file = client.upload_file(path)
                client(EditPhotoRequest(
                    channel=channel,
                    photo=InputChatUploadedPhoto(file=file),
                ))
                print("  set profile photo")
            except Exception as e:
                photo_note = f" (photo failed: {e})"
                print(f"  [WARN] photo failed: {e}", file=sys.stderr)
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        else:
            photo_note = " (photo download failed)"

    # 4. Invite link (best-effort)
    invite = f"https://t.me/{username}"
    try:
        inv = client(ExportChatInviteRequest(peer=channel))
        invite = getattr(inv, "link", invite) or invite
    except Exception:
        pass

    report(job_id, "done",
           f"Claimed @{username}.{photo_note}",
           channel_id=channel.id,
           invite_link=invite)


def main():
    print(f"Worker starting. App: {APP_BASE_URL}")
    with TelegramClient(SESSION, API_ID, API_HASH) as client:
        me = client.get_me()
        print(f"Signed in as {me.first_name} (id={me.id})")
        while True:
            try:
                job = fetch_job()
                if job:
                    try:
                        process_job(client, job)
                    except Exception:
                        traceback.print_exc()
                        try:
                            report(job["id"], "failed", "Unexpected worker error (see logs)")
                        except Exception:
                            pass
                else:
                    time.sleep(POLL_INTERVAL)
            except KeyboardInterrupt:
                print("\nShutting down.")
                return
            except Exception as e:
                print(f"[ERR] poll loop: {e}", file=sys.stderr)
                time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
