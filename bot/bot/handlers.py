import html

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from . import api
from .api import ApiError
from .keyboards import course_kb, courses_kb, level_kb, settings_kb

router = Router()

HELP_TEXT = (
    "<b>Tubinator</b> turns any topic into a personalized course of "
    "hand-picked YouTube lessons.\n\n"
    "<b>Commands</b>\n"
    "/learn – create a new course\n"
    "/courses – view your courses &amp; progress\n"
    "/settings – add your own Groq/YouTube API keys (optional)\n"
    "/cancel – abort the current action\n"
    "/help – show this message"
)


class Learn(StatesGroup):
    topic = State()
    level = State()
    goal = State()


class Keys(StatesGroup):
    waiting = State()


def fmt_duration(seconds) -> str:
    s = int(seconds or 0)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m}:{sec:02d}"


def render_course_text(course) -> str:
    total = 0
    done = 0
    body = []
    for mi, module in enumerate(course["modules"], 1):
        body.append(f"\n<b>Module {mi}: {html.escape(module['title'])}</b>")
        for lesson in module["lessons"]:
            total += 1
            prog = lesson.get("progress") or []
            d = bool(prog) and bool(prog[0].get("completed"))
            if d:
                done += 1
            body.append(f"  {'✅' if d else '•'} {html.escape(lesson['title'])}")
    header = (
        f"<b>{html.escape(course['title'])}</b>\n"
        f"Progress: {done}/{total} lessons complete\n"
    )
    return header + "\n".join(body)


@router.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "👋 Welcome to <b>Tubinator</b>!\n\n"
        "Tell me what you want to learn and I'll build you a custom course of "
        "the best YouTube tutorials, organized into modules and lessons.\n\n"
        "Tap /learn to begin."
    )


@router.message(Command("help"))
async def cmd_help(msg: Message):
    await msg.answer(HELP_TEXT)


@router.message(Command("cancel"))
async def cmd_cancel(msg: Message, state: FSMContext):
    await state.clear()
    await msg.answer("Cancelled.")


# ---- /learn wizard ----
@router.message(Command("learn"))
async def learn_start(msg: Message, state: FSMContext):
    await state.set_state(Learn.topic)
    await msg.answer(
        "What do you want to learn? <i>(e.g. PostgreSQL indexing)</i>"
    )


@router.message(Learn.topic, F.text)
async def learn_topic(msg: Message, state: FSMContext):
    await state.update_data(topic=msg.text.strip())
    await state.set_state(Learn.level)
    await msg.answer("Pick your level:", reply_markup=level_kb())


@router.callback_query(Learn.level, F.data.startswith("level:"))
async def learn_level(cb: CallbackQuery, state: FSMContext):
    level = cb.data.split(":", 1)[1]
    await state.update_data(level=level)
    await state.set_state(Learn.goal)
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass
    await cb.message.answer(
        "What's your goal? <i>(e.g. build a side project, pass an exam)</i>"
    )
    await cb.answer()


@router.message(Learn.goal, F.text)
async def learn_goal(msg: Message, state: FSMContext):
    data = await state.get_data()
    goal = msg.text.strip()
    await state.clear()
    wait = await msg.answer("🧠 Generating your course… this can take ~10s")
    try:
        res = await api.generate_course(
            msg.from_user.id,
            msg.from_user.full_name,
            data["topic"],
            data["level"],
            goal,
        )
        course = (await api.get_course(msg.from_user.id, res["courseId"]))["course"]
    except ApiError as e:
        await wait.edit_text(f"⚠️ {html.escape(str(e))}")
        return
    try:
        await wait.delete()
    except Exception:
        pass
    await msg.answer(render_course_text(course), reply_markup=course_kb(course))


# ---- /courses ----
@router.message(Command("courses"))
async def cmd_courses(msg: Message):
    items = (await api.list_courses(msg.from_user.id))["courses"]
    if not items:
        await msg.answer("You have no courses yet. Use /learn to create one!")
        return
    await msg.answer("📚 Your courses:", reply_markup=courses_kb(items))


@router.callback_query(F.data == "mycourses")
async def cb_mycourses(cb: CallbackQuery):
    items = (await api.list_courses(cb.from_user.id))["courses"]
    if not items:
        await cb.message.answer("You have no courses yet. Use /learn.")
    else:
        await cb.message.answer("📚 Your courses:", reply_markup=courses_kb(items))
    await cb.answer()


@router.callback_query(F.data.startswith("course:"))
async def cb_course(cb: CallbackQuery):
    cid = cb.data.split(":", 1)[1]
    try:
        course = (await api.get_course(cb.from_user.id, cid))["course"]
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.message.answer(render_course_text(course), reply_markup=course_kb(course))
    await cb.answer()


@router.callback_query(F.data.startswith("watch:"))
async def cb_watch(cb: CallbackQuery):
    lesson_id = cb.data.split(":", 1)[1]
    await cb.answer("Finding the best video…")
    try:
        res = await api.fetch_video(cb.from_user.id, lesson_id)
    except ApiError as e:
        await cb.message.answer(f"⚠️ {html.escape(str(e))}")
        return
    v = res["video"]
    url = f"https://www.youtube.com/watch?v={v['youtubeId']}"
    await cb.message.answer(
        f"🎬 <b>{html.escape(v['title'])}</b>\n"
        f"{html.escape(v['channelName'])} · {fmt_duration(v.get('duration'))}\n"
        f"{url}"
    )


@router.callback_query(F.data.startswith("toggle:"))
async def cb_toggle(cb: CallbackQuery):
    _, lesson_id, flag = cb.data.split(":")
    completed = flag == "1"
    try:
        await api.set_progress(cb.from_user.id, lesson_id, completed)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("Marked complete ✅" if completed else "Marked not done")


# ---- /settings (BYOK) ----
@router.message(Command("settings"))
async def cmd_settings(msg: Message):
    await msg.answer(
        "⚙️ <b>Settings — API keys (BYOK)</b>\n\n"
        "By default you use shared house keys with a small daily limit. "
        "Add your own keys to lift the limit and run on your own quota. "
        "Keys are stored encrypted.\n\n"
        "• Groq key: https://console.groq.com/keys\n"
        "• YouTube key: https://console.cloud.google.com/apis/credentials",
        reply_markup=settings_kb(),
        disable_web_page_preview=True,
    )


@router.callback_query(F.data.startswith("setkey:"))
async def cb_setkey(cb: CallbackQuery, state: FSMContext):
    provider = cb.data.split(":", 1)[1]
    await state.set_state(Keys.waiting)
    await state.update_data(provider=provider)
    await cb.message.answer(
        f"Send me your <b>{provider.title()}</b> API key and I'll store it "
        "encrypted. I'll delete your message right after.\n\nSend /cancel to abort."
    )
    await cb.answer()


@router.callback_query(F.data.startswith("clearkey:"))
async def cb_clearkey(cb: CallbackQuery):
    provider = cb.data.split(":", 1)[1]
    try:
        await api.set_key(cb.from_user.id, provider, None)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer(f"{provider.title()} key cleared")
    await cb.message.answer(
        f"🗑 {provider.title()} key removed. You're back on the house key."
    )


@router.message(Keys.waiting, F.text)
async def keys_value(msg: Message, state: FSMContext):
    provider = (await state.get_data()).get("provider")
    value = msg.text.strip()
    await state.clear()
    try:
        await msg.delete()
    except Exception:
        pass
    try:
        await api.set_key(msg.from_user.id, provider, value)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer(
        f"✅ {provider.title()} key saved (encrypted). Your message was deleted."
    )
