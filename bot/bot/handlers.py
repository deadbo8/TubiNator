import html

from aiogram import F, Router
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from . import api
from .api import ApiError
from .keyboards import (
    admin_delete_confirm_kb,
    admin_user_actions_kb,
    admin_users_kb,
    course_kb,
    courses_kb,
    level_kb,
    settings_kb,
)

router = Router()

HELP_TEXT = (
    "<b>Tubinator</b> turns any topic into a personalized course of "
    "hand-picked YouTube lessons.\n\n"
    "<b>Commands</b>\n"
    "/learn – create a new course\n"
    "/courses – view your courses &amp; progress\n"
    "/me – your account &amp; usage\n"
    "/settings – email, password &amp; API keys\n"
    "/admin – admin panel (admins only)\n"
    "/cancel – abort the current action\n"
    "/help – show this message"
)


class Learn(StatesGroup):
    topic = State()
    level = State()
    goal = State()


class Keys(StatesGroup):
    waiting = State()


class LinkEmail(StatesGroup):
    email = State()
    code = State()


class Password(StatesGroup):
    current = State()
    new = State()


class AdminLimit(StatesGroup):
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


def render_account_text(acc) -> str:
    email = html.escape(acc.get("email") or "not linked")
    verified = "✅ verified" if acc.get("emailVerified") else "⚠️ unverified"
    pw = "set" if acc.get("hasPassword") else "not set"
    limit = acc.get("limit")
    used = acc.get("dailyGenCount", 0)
    groq = acc.get("groqKeyMasked") or "house key"
    yt = acc.get("youtubeKeyMasked") or "house key"
    lines = [
        "👤 <b>Your account</b>",
        f"Email: {email} ({verified})" if acc.get("email") else f"Email: {email}",
        f"Password: {pw}",
        f"Today's generations: {used}/{limit}",
        f"Groq key: {html.escape(groq)}",
        f"YouTube key: {html.escape(yt)}",
    ]
    if acc.get("isAdmin"):
        lines.append("Role: ⭐ admin")
    if acc.get("banned"):
        lines.append("🚫 This account is banned.")
    return "\n".join(lines)


# ---- start / help / cancel ----
@router.message(CommandStart())
async def cmd_start(msg: Message):
    await msg.answer(
        "👋 Welcome to <b>Tubinator</b>!\n\n"
        "Tell me what you want to learn and I'll build you a custom course of "
        "the best YouTube tutorials, organized into modules and lessons.\n\n"
        "Tap /learn to begin, or /settings to link your email so your courses "
        "sync with the website."
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
    await msg.answer("What do you want to learn? <i>(e.g. PostgreSQL indexing)</i>")


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
    url = "https://www.youtube.com/watch?v=" + str(v["youtubeId"])
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


# ---- /me ----
@router.message(Command("me"))
async def cmd_me(msg: Message):
    try:
        acc = (await api.get_account(msg.from_user.id, msg.from_user.full_name))[
            "account"
        ]
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer(render_account_text(acc))


# ---- /settings ----
async def _show_settings(target, telegram_id, name):
    acc = (await api.get_account(telegram_id, name))["account"]
    text = (
        "⚙️ <b>Settings</b>\n\n"
        + render_account_text(acc)
        + "\n\nManage your account below. Keys are stored encrypted; "
        "messages containing secrets are deleted automatically."
    )
    await target.answer(text, reply_markup=settings_kb(acc), disable_web_page_preview=True)


@router.message(Command("settings"))
async def cmd_settings(msg: Message):
    try:
        await _show_settings(msg, msg.from_user.id, msg.from_user.full_name)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")


# ---- Email linking ----
@router.callback_query(F.data == "linkemail")
async def cb_linkemail(cb: CallbackQuery, state: FSMContext):
    await state.set_state(LinkEmail.email)
    await cb.message.answer(
        "✉️ Send me the email you want to link. I'll send a 6-digit "
        "verification code to it.\n\nSend /cancel to abort."
    )
    await cb.answer()


@router.message(LinkEmail.email, F.text)
async def link_email_value(msg: Message, state: FSMContext):
    email = msg.text.strip()
    try:
        await api.link_start(msg.from_user.id, email)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await state.update_data(email=email)
    await state.set_state(LinkEmail.code)
    await msg.answer(
        f"📨 I sent a code to <b>{html.escape(email)}</b>. "
        "Send me the 6-digit code to finish linking."
    )


@router.message(LinkEmail.code, F.text)
async def link_email_code(msg: Message, state: FSMContext):
    email = (await state.get_data()).get("email")
    code = msg.text.strip()
    try:
        res = await api.link_confirm(msg.from_user.id, email, code)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await state.clear()
    extra = (
        "\n\nYour Telegram courses were merged with your existing website account."
        if res.get("merged")
        else "\n\nYou can now log in on the website with this email too."
    )
    await msg.answer(
        f"✅ Email <b>{html.escape(email)}</b> verified and linked.{extra}"
    )


# ---- Password ----
@router.callback_query(F.data == "setpw")
async def cb_setpw(cb: CallbackQuery, state: FSMContext):
    try:
        acc = (await api.get_account(cb.from_user.id))["account"]
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    if not acc.get("emailVerified"):
        await cb.answer("Link and verify your email first.", show_alert=True)
        return
    if acc.get("hasPassword"):
        await state.set_state(Password.current)
        await cb.message.answer(
            "Send your <b>current</b> password. I'll delete the message right after. "
            "Send /cancel to abort."
        )
    else:
        await state.set_state(Password.new)
        await cb.message.answer(
            "Send a <b>new</b> password (min 8 characters). I'll delete the message "
            "right after. Send /cancel to abort."
        )
    await cb.answer()


@router.message(Password.current, F.text)
async def pw_current(msg: Message, state: FSMContext):
    await state.update_data(current=msg.text.strip())
    try:
        await msg.delete()
    except Exception:
        pass
    await state.set_state(Password.new)
    await msg.answer("Now send your <b>new</b> password (min 8 characters).")


@router.message(Password.new, F.text)
async def pw_new(msg: Message, state: FSMContext):
    data = await state.get_data()
    new_pw = msg.text.strip()
    await state.clear()
    try:
        await msg.delete()
    except Exception:
        pass
    try:
        await api.set_password(msg.from_user.id, new_pw, data.get("current"))
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer("✅ Password updated. Your message was deleted for safety.")


# ---- BYOK keys ----
@router.callback_query(F.data.startswith("setkey:"))
async def cb_setkey(cb: CallbackQuery, state: FSMContext):
    provider = cb.data.split(":", 1)[1]
    await state.set_state(Keys.waiting)
    await state.update_data(provider=provider)
    hint = (
        "https://console.groq.com/keys"
        if provider == "groq"
        else "https://console.cloud.google.com/apis/credentials"
    )
    await cb.message.answer(
        f"Send me your <b>{provider.title()}</b> API key and I'll store it "
        f"encrypted. I'll delete your message right after.\n\nGet one: {hint}\n\n"
        "Send /cancel to abort.",
        disable_web_page_preview=True,
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


# ---- Admin ----
async def _show_admin_list(target, telegram_id):
    try:
        users = (await api.admin_list_users(telegram_id))["users"]
    except ApiError as e:
        await target.answer(f"⚠️ {html.escape(str(e))}")
        return
    if not users:
        await target.answer("No users found.")
        return
    await target.answer(
        f"🛡 <b>Admin · Users</b> ({len(users)})\nTap a user to manage.",
        reply_markup=admin_users_kb(users),
    )


async def _find_user(telegram_id, uid):
    users = (await api.admin_list_users(telegram_id))["users"]
    for u in users:
        if u["id"] == uid:
            return u
    return None


@router.message(Command("admin"))
async def cmd_admin(msg: Message):
    await _show_admin_list(msg, msg.from_user.id)


@router.callback_query(F.data == "admin")
async def cb_admin(cb: CallbackQuery):
    await _show_admin_list(cb.message, cb.from_user.id)
    await cb.answer()


@router.callback_query(F.data.startswith("au:"))
async def cb_admin_user(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    try:
        u = await _find_user(cb.from_user.id, uid)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    if not u:
        await cb.answer("User not found", show_alert=True)
        return
    limit = u.get("dailyGenLimit")
    limit_txt = str(limit) if limit is not None else "default"
    text = (
        f"👤 <b>{html.escape(u.get('email') or u.get('name') or 'User')}</b>\n"
        f"Verified: {'yes' if u.get('emailVerified') else 'no'}\n"
        f"Courses: {u.get('_count', {}).get('courses', 0)}\n"
        f"Used today: {u.get('dailyGenCount', 0)}\n"
        f"Daily limit: {limit_txt}\n"
        f"Banned: {'yes' if u.get('banned') else 'no'}"
    )
    await cb.message.answer(text, reply_markup=admin_user_actions_kb(u))
    await cb.answer()


@router.callback_query(F.data.startswith("aban:"))
async def cb_admin_ban(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    try:
        await api.admin_update_user(cb.from_user.id, uid, banned=True)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("User banned")
    await cb.message.answer("🚫 User banned.")


@router.callback_query(F.data.startswith("aunban:"))
async def cb_admin_unban(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    try:
        await api.admin_update_user(cb.from_user.id, uid, banned=False)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("User unbanned")
    await cb.message.answer("✅ User unbanned.")


@router.callback_query(F.data.startswith("alimdef:"))
async def cb_admin_limit_default(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    try:
        await api.admin_update_user(cb.from_user.id, uid, daily_limit=None)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("Limit reset to default")
    await cb.message.answer("♻️ Daily limit reset to the house default.")


@router.callback_query(F.data.startswith("alim:"))
async def cb_admin_limit(cb: CallbackQuery, state: FSMContext):
    uid = cb.data.split(":", 1)[1]
    await state.set_state(AdminLimit.waiting)
    await state.update_data(target=uid)
    await cb.message.answer(
        "Send the new daily generation limit for this user (a whole number, e.g. 20)."
    )
    await cb.answer()


@router.message(AdminLimit.waiting, F.text)
async def admin_limit_value(msg: Message, state: FSMContext):
    uid = (await state.get_data()).get("target")
    await state.clear()
    raw = msg.text.strip()
    if not raw.isdigit():
        await msg.answer("That's not a whole number. Cancelled.")
        return
    try:
        await api.admin_update_user(msg.from_user.id, uid, daily_limit=int(raw))
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer(f"🎚 Daily limit set to {raw}.")


@router.callback_query(F.data.startswith("adelyes:"))
async def cb_admin_delete_yes(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    try:
        await api.admin_delete_user(cb.from_user.id, uid)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("Account deleted")
    await cb.message.answer("🗑 Account permanently deleted.")


@router.callback_query(F.data.startswith("adel:"))
async def cb_admin_delete(cb: CallbackQuery):
    uid = cb.data.split(":", 1)[1]
    await cb.message.answer(
        "⚠️ Permanently delete this account and all its data? This cannot be undone.",
        reply_markup=admin_delete_confirm_kb(uid),
    )
    await cb.answer()
