#!/usr/bin/env python3
"""
Telegram username claimer worker.

Drives two flows against the Lovable web app:

  1. Login flow — turns pending `telegram_login_requests` into signed-in
     Telegram sessions stored (encrypted) on the web side.
  2. Claim flow — picks up `claim_jobs`, uses the attached account's
     session to create a channel and claim the username.

Requirements: pip install telethon requests

Environment (see .env.example):
  APP_BASE_URL     e.g. https://project--<id>.lovable.app
  WORKER_TOKEN     shared bearer token (from Lovable Cloud secrets)
  TG_API_ID        from https://my.telegram.org
  TG_API_HASH      from https://my.telegram.org
  POLL_INTERVAL    seconds between polls (default 3)
"""
import os
import random
import sys
import time
import tempfile
import traceback
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).with_name(".env"))
except ImportError:
    pass


import requests
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PhoneNumberInvalidError,
    PasswordHashInvalidError,
    UsernameOccupiedError,
    UsernameInvalidError,
    UsernamePurchaseAvailableError,
    ChannelsAdminPublicTooMuchError,
    FloodWaitError,
)
from telethon.tl.functions.channels import (
    CreateChannelRequest,
    UpdateUsernameRequest,
    EditPhotoRequest,
)
from telethon.tl.functions.messages import ExportChatInviteRequest
from telethon.tl.types import InputChatUploadedPhoto


APP_BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
WORKER_TOKEN = os.environ["WORKER_TOKEN"]
API_ID = int(os.environ["TG_API_ID"])
API_HASH = os.environ["TG_API_HASH"]
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "3"))

HEADERS = {
    "Authorization": f"Bearer {WORKER_TOKEN}",
    "Content-Type": "application/json",
}

# In-memory: login_request_id -> TelegramClient waiting between code / password steps
_pending_clients: dict[str, TelegramClient] = {}


def api_post(path: str, payload: dict) -> dict:
    r = requests.post(f"{APP_BASE_URL}{path}", headers=HEADERS,
                      json=payload, timeout=20)
    if not r.ok:
        raise RuntimeError(f"{path} -> {r.status_code} {r.text}")
    return r.json()


# ---------------------------------------------------------------------------
# LOGIN FLOW
# ---------------------------------------------------------------------------

def report_login(task_id: str, action: str, **extra) -> None:
    body = {"id": task_id, "action": action, **extra}
    try:
        api_post("/api/public/worker/complete-login-step", body)
    except Exception as e:
        print(f"[WARN] report_login failed: {e}", file=sys.stderr)


def handle_login_task(task: dict) -> None:
    task_id = task["id"]
    status = task["status"]
    phone = task["phone"]

    if status == "pending":
        client = TelegramClient(StringSession(), API_ID, API_HASH)
        try:
            client.connect()
            sent = client.send_code_request(phone)
            _pending_clients[task_id] = client
            report_login(task_id, "code_sent",
                         phone_code_hash=sent.phone_code_hash)
            print(f"[LOGIN {task_id}] code sent to {phone}")
        except (PhoneNumberInvalidError,) as e:
            _safe_disconnect(client)
            report_login(task_id, "error", error_message=f"Invalid phone: {e}")
        except FloodWaitError as e:
            _safe_disconnect(client)
            report_login(task_id, "error",
                         error_message=f"FloodWait: try again in {e.seconds}s")
        except Exception as e:
            _safe_disconnect(client)
            report_login(task_id, "error", error_message=f"send_code: {e}")

    elif status == "submit_code":
        client = _pending_clients.get(task_id)
        if client is None:
            report_login(task_id, "error",
                         error_message="Worker restarted mid-login. Start over.")
            return
        code = task.get("code") or ""
        try:
            client.sign_in(phone=phone, code=code,
                           phone_code_hash=task.get("phone_code_hash"))
            _finalize_success(task_id, client)
        except SessionPasswordNeededError:
            report_login(task_id, "need_2fa")
            print(f"[LOGIN {task_id}] 2FA required")
        except (PhoneCodeInvalidError, PhoneCodeExpiredError) as e:
            _cleanup(task_id)
            report_login(task_id, "error", error_message=f"Code: {e}")
        except Exception as e:
            _cleanup(task_id)
            report_login(task_id, "error", error_message=f"sign_in: {e}")

    elif status == "submit_2fa":
        client = _pending_clients.get(task_id)
        if client is None:
            report_login(task_id, "error",
                         error_message="Worker restarted mid-login. Start over.")
            return
        password = task.get("password") or ""
        try:
            client.sign_in(password=password)
            _finalize_success(task_id, client)
        except PasswordHashInvalidError:
            _cleanup(task_id)
            report_login(task_id, "error",
                         error_message="Invalid cloud password")
        except Exception as e:
            _cleanup(task_id)
            report_login(task_id, "error", error_message=f"2fa: {e}")


def _finalize_success(task_id: str, client: TelegramClient) -> None:
    try:
        me = client.get_me()
        session_str = client.session.save()
        report_login(task_id, "success",
                     session=session_str,
                     tg_user_id=int(me.id),
                     tg_username=getattr(me, "username", None),
                     first_name=getattr(me, "first_name", None))
        print(f"[LOGIN {task_id}] success: {me.first_name} (id={me.id})")
    finally:
        _cleanup(task_id)


def _cleanup(task_id: str) -> None:
    client = _pending_clients.pop(task_id, None)
    if client is not None:
        _safe_disconnect(client)


def _safe_disconnect(client: TelegramClient) -> None:
    try:
        client.disconnect()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CLAIM FLOW
# ---------------------------------------------------------------------------

def report_job(job_id, status, message="", channel_id=None, invite_link=None,
               failure_reason=None):
    payload = {"id": job_id, "status": status,
               "result_message": message[:1900]}
    if channel_id:
        payload["channel_id"] = str(channel_id)
    if invite_link:
        payload["invite_link"] = invite_link
    if failure_reason:
        payload["failure_reason"] = failure_reason
    try:
        api_post("/api/public/worker/complete", payload)
    except Exception as e:
        print(f"[WARN] report_job failed: {e}", file=sys.stderr)


def download_pfp(url: str):
    try:
        r = requests.get(url, timeout=20)
        r.raise_for_status()
        suffix = ".png" if "png" in r.headers.get("content-type", "").lower() else ".jpg"
        fd, path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(fd, "wb") as f:
            f.write(r.content)
        return path
    except Exception as e:
        print(f"[WARN] pfp download failed: {e}", file=sys.stderr)
        return None


def process_job(job: dict):
    job_id = job["id"]
    username = job["username"].lstrip("@")
    title = job["channel_title"]
    about = job.get("channel_description") or ""
    pfp_url = job.get("pfp_url")
    session_str = job.get("account_session")
    phone = job.get("account_phone", "?")

    if not session_str:
        report_job(job_id, "failed", "No session attached to job")
        return

    print(f"[JOB {job_id}] @{username} \"{title}\" via {phone}")

    client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
    try:
        client.connect()
        if not client.is_user_authorized():
            report_job(job_id, "failed",
                       "Telegram session is no longer authorized. Reconnect the account.")
            return

        # 1. Create channel
        try:
            result = client(CreateChannelRequest(
                title=title, about=about, megagroup=False, broadcast=True,
            ))
        except FloodWaitError as e:
            report_job(job_id, "failed", f"FloodWait creating channel: {e.seconds}s")
            return
        except Exception as e:
            report_job(job_id, "failed", f"CreateChannel error: {e}")
            return
        channel = result.chats[0]

        # 2. Claim username
        try:
            ok = client(UpdateUsernameRequest(channel=channel, username=username))
            if not ok:
                report_job(job_id, "failed",
                           "Telegram returned False on UpdateUsername",
                           channel_id=channel.id)
                return
        except UsernameOccupiedError:
            report_job(job_id, "failed", f"@{username} is already taken",
                       channel_id=channel.id, failure_reason="taken")
            return
        except UsernameInvalidError:
            report_job(job_id, "failed", f"@{username} is invalid",
                       channel_id=channel.id, failure_reason="invalid")
            return
        except UsernamePurchaseAvailableError:
            report_job(job_id, "failed",
                       f"@{username} is only available for purchase on Fragment",
                       channel_id=channel.id, failure_reason="fragment")
            return
        except ChannelsAdminPublicTooMuchError:
            report_job(job_id, "failed",
                       "Your account owns too many public channels. Free one first.",
                       channel_id=channel.id, failure_reason="other")
            return
        except FloodWaitError as e:
            report_job(job_id, "failed",
                       f"FloodWait on username: {e.seconds}s",
                       channel_id=channel.id, failure_reason="flood")
            return
        except Exception as e:
            report_job(job_id, "failed", f"UpdateUsername error: {e}",
                       channel_id=channel.id, failure_reason="other")
            return

        # 3. Profile photo (best-effort)
        photo_note = ""
        if pfp_url:
            path = download_pfp(pfp_url)
            if path:
                try:
                    f = client.upload_file(path)
                    client(EditPhotoRequest(
                        channel=channel,
                        photo=InputChatUploadedPhoto(file=f),
                    ))
                except Exception as e:
                    photo_note = f" (photo failed: {e})"
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

        report_job(job_id, "done",
                   f"Claimed @{username}.{photo_note}",
                   channel_id=channel.id, invite_link=invite)
    finally:
        _safe_disconnect(client)


# ---------------------------------------------------------------------------
# MAIN LOOP
# ---------------------------------------------------------------------------

def poll_login_step():
    res = api_post("/api/public/worker/next-login-step", {})
    task = res.get("task")
    if task:
        handle_login_task(task)
        return True
    return False


def poll_claim_job():
    res = api_post("/api/public/worker/next-job", {})
    job = res.get("job")
    if job:
        try:
            process_job(job)
        except Exception:
            traceback.print_exc()
            try:
                report_job(job["id"], "failed",
                           "Unexpected worker error (see logs)",
                           failure_reason="other")
            except Exception:
                pass
        # Pace claims: random 10-15s gap to avoid Telegram spam flags.
        gap = random.uniform(10.0, 15.0)
        print(f"[JOB] cooldown {gap:.1f}s before next claim")
        time.sleep(gap)
        return True
    return False


def main():
    print(f"Worker starting. App: {APP_BASE_URL}")
    while True:
        try:
            did_login = poll_login_step()
            did_job = poll_claim_job()
            if not (did_login or did_job):
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            print("\nShutting down.")
            for tid in list(_pending_clients):
                _cleanup(tid)
            return
        except Exception as e:
            print(f"[ERR] poll loop: {e}", file=sys.stderr)
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
