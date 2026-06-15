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


async def close():
    global _session
    if _session and not _session.closed:
        await _session.close()
