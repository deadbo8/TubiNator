import aiohttp

from .config import API_BASE_URL, BOT_API_SECRET


class ApiError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.status = status


_session: aiohttp.ClientSession | None = None


async def _get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        _session = aiohttp.ClientSession(
            headers={"Authorization": f"Bearer {BOT_API_SECRET}"},
            timeout=aiohttp.ClientTimeout(total=60),
        )
    return _session


async def _request(method: str, path: str, **kwargs):
    session = await _get_session()
    url = f"{API_BASE_URL}{path}"
    async with session.request(method, url, **kwargs) as resp:
        try:
            data = await resp.json()
        except Exception:
            data = {}
        if resp.status >= 400:
            raise ApiError(
                data.get("error", f"Request failed ({resp.status})"), resp.status
            )
        return data


# ---- Courses ----
async def generate_course(telegram_id, name, topic, level, goal):
    return await _request(
        "POST",
        "/api/bot/courses",
        json={
            "telegramId": str(telegram_id),
            "name": name,
            "topic": topic,
            "level": level,
            "goal": goal,
        },
    )


async def list_courses(telegram_id):
    return await _request(
        "GET", "/api/bot/courses", params={"telegramId": str(telegram_id)}
    )


async def get_course(telegram_id, course_id):
    return await _request(
        "GET",
        f"/api/bot/courses/{course_id}",
        params={"telegramId": str(telegram_id)},
    )


async def fetch_video(telegram_id, lesson_id):
    return await _request(
        "POST",
        f"/api/bot/lessons/{lesson_id}/video",
        json={"telegramId": str(telegram_id)},
    )


async def set_progress(telegram_id, lesson_id, completed):
    return await _request(
        "POST",
        f"/api/bot/lessons/{lesson_id}/progress",
        json={"telegramId": str(telegram_id), "completed": completed},
    )


# ---- Keys (BYOK) ----
async def set_key(telegram_id, provider, value):
    return await _request(
        "POST",
        "/api/bot/keys",
        json={
            "telegramId": str(telegram_id),
            "provider": provider,
            "value": value,
        },
    )


# ---- Account / settings ----
async def get_account(telegram_id, name=None):
    params = {"telegramId": str(telegram_id)}
    if name:
        params["name"] = name
    return await _request("GET", "/api/bot/account", params=params)


async def link_start(telegram_id, email):
    return await _request(
        "POST",
        "/api/bot/link/start",
        json={"telegramId": str(telegram_id), "email": email},
    )


async def link_confirm(telegram_id, email, code):
    return await _request(
        "POST",
        "/api/bot/link/confirm",
        json={"telegramId": str(telegram_id), "email": email, "code": code},
    )


async def set_password(telegram_id, new_password, current_password=None):
    payload = {
        "telegramId": str(telegram_id),
        "newPassword": new_password,
    }
    if current_password:
        payload["currentPassword"] = current_password
    return await _request("POST", "/api/bot/password", json=payload)


# ---- Reviews (spaced repetition) ----
async def get_reviews(telegram_id):
    return await _request(
        "GET", "/api/bot/reviews", params={"telegramId": str(telegram_id)}
    )


async def grade_review(telegram_id, lesson_id, remembered):
    return await _request(
        "POST",
        f"/api/bot/reviews/{lesson_id}",
        json={"telegramId": str(telegram_id), "remembered": remembered},
    )


# ---- Explore (public catalog) ----
async def explore_courses(q=None):
    params = {}
    if q:
        params["q"] = q
    return await _request("GET", "/api/bot/explore", params=params)


async def enroll_course(telegram_id, course_id):
    return await _request(
        "POST",
        f"/api/bot/courses/{course_id}/enroll",
        json={"telegramId": str(telegram_id)},
    )


# ---- Admin ----
async def admin_list_users(telegram_id):
    return await _request(
        "GET", "/api/bot/admin/users", params={"telegramId": str(telegram_id)}
    )


async def admin_update_user(telegram_id, target_id, *, daily_limit=..., banned=...):
    payload = {"telegramId": str(telegram_id)}
    if daily_limit is not ...:
        payload["dailyGenLimit"] = daily_limit
    if banned is not ...:
        payload["banned"] = banned
    return await _request(
        "PATCH", f"/api/bot/admin/users/{target_id}", json=payload
    )


async def admin_delete_user(telegram_id, target_id):
    return await _request(
        "DELETE",
        f"/api/bot/admin/users/{target_id}",
        params={"telegramId": str(telegram_id)},
    )


async def close():
    global _session
    if _session and not _session.closed:
        await _session.close()
