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
    explore_kb,
    level_kb,
    login_kb,
    login_methods_kb,
    main_menu_kb,
    review_grade_kb,
    settings_kb,
    setpw_kb,
)

router = Router()

HELP_TEXT = (
    "<b>Tubinator</b> turns any topic into a personalized course of "
    "hand-picked YouTube lessons.\n\n"
    "<b>Commands</b>\n"
    "/learn – create a new course\n"
    "/courses – view your courses &amp; progress\n"
    "/review – review due lessons (spaced repetition)\n"
    "/explore – browse &amp; add public courses\n"
    "/me – your account, XP &amp; streak\n"
    "/signup – create a Tubinator account\n"
    "/login – log in (password or email code)\n"
    "/forgot – reset your password\n"
    "/signout – sign out of this device\n"
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


class Explore(StatesGroup):
    query = State()


class LoginPw(StatesGroup):
    email = State()
    password = State()


class Forgot(StatesGroup):
    email = State()
    code = State()
    password = State()


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
    stats = acc.get("stats") or {}
    if stats:
        lines.append("")
        lines.append(
            f"⚡ Level {stats.get('level', 1)} · {stats.get('xp', 0)} XP "
            f"({stats.get('levelPct', 0)}% to next)"
        )
        lines.append(
            f"🔥 Streak: {stats.get('streak', 0)} day(s) "
            f"(best {stats.get('longestStreak', 0)})"
        )
        due = stats.get("dueReviews", 0)
        if due:
            lines.append(f"🧠 {due} review(s) due — use /review")
    if acc.get("isAdmin"):
        lines.append("Role: ⭐ admin")
    if acc.get("banned"):
        lines.append("🚫 This account is banned.")
    return "\n".join(lines)


# ---- login gate ----
async def _fetch_account(telegram_id, name=None):
    return (await api.get_account(telegram_id, name))["account"]


async def _require_login(target, telegram_id, name=None):
    """Return the account if the user is logged in (verified email) and not
    banned; otherwise send a friendly prompt and return None."""
    try:
        acc = await _fetch_account(telegram_id, name)
    except ApiError as e:
        await target.answer(f"⚠️ {html.escape(str(e))}")
        return None
    if acc.get("banned"):
        await target.answer("🚫 This account is banned. Contact an admin.")
        return None
    if not acc.get("emailVerified"):
        await target.answer(
            "🔒 <b>Login required</b>\n\n"
            "Tubinator keeps your courses, XP and streak tied to your account, "
            "so first verify your email — it takes about 20 seconds and unlocks "
            "everything.\n\n"
            "Tap below or send /login to begin.",
            reply_markup=login_kb(),
        )
        return None
    if not acc.get("hasPassword"):
        await target.answer(
            "🔒 <b>Almost there!</b>\n\n"
            "Finish creating your account by setting a password. Then you can "
            "log in with email + password or a one-time code.",
            reply_markup=setpw_kb(),
        )
        return None
    return acc


# ---- start / help / cancel ----
@router.message(CommandStart())
async def cmd_start(msg: Message, state: FSMContext):
    await state.clear()
    try:
        acc = await _fetch_account(msg.from_user.id, msg.from_user.full_name)
    except ApiError:
        acc = None
    if acc and acc.get("emailVerified"):
        name = html.escape(acc.get("name") or "")
        greeting = f"👋 Welcome back, {name}!" if name else "👋 Welcome back!"
        await msg.answer(
            f"{greeting} What would you like to do?",
            reply_markup=main_menu_kb(),
        )
        return
    limit = (acc or {}).get("limit", 5)
    await msg.answer(
        "👋 <b>Welcome to Tubinator!</b>\n\n"
        "I turn any topic into a personalized course of the best YouTube "
        "lessons — split into modules, with progress tracking, XP, streaks "
        "and spaced-repetition review.\n\n"
        "🔒 <b>First, a quick login.</b>\n"
        "Verify your email (about 20 seconds) so your courses sync with the "
        f"website and stay safe. You'll get <b>{limit} free course "
        "generations per day</b>.\n\n"
        "Tap below or send /login to begin.",
        reply_markup=login_kb(),
    )


@router.message(Command("help"))
async def cmd_help(msg: Message, state: FSMContext):
    await state.clear()
    await msg.answer(HELP_TEXT)


@router.message(Command("cancel"))
async def cmd_cancel(msg: Message, state: FSMContext):
    await state.clear()
    await msg.answer("Cancelled.")


# ---- main menu (inline navigation) ----
@router.callback_query(F.data == "menu:learn")
async def cb_menu_learn(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    if not await _require_login(cb.message, cb.from_user.id, cb.from_user.full_name):
        return
    await state.set_state(Learn.topic)
    await cb.message.answer(
        "What do you want to learn? <i>(e.g. PostgreSQL indexing)</i>"
    )


@router.callback_query(F.data == "menu:review")
async def cb_menu_review(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    if not await _require_login(cb.message, cb.from_user.id, cb.from_user.full_name):
        return
    await _send_next_review(cb.message, cb.from_user.id)


@router.callback_query(F.data == "menu:explore")
async def cb_menu_explore(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    if not await _require_login(cb.message, cb.from_user.id, cb.from_user.full_name):
        return
    await state.set_state(Explore.query)
    await cb.message.answer(
        "🔍 Send a topic to search the public catalog, or send "
        "<b>all</b> to see everything."
    )


@router.callback_query(F.data == "menu:settings")
async def cb_menu_settings(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    try:
        await _show_settings(cb.message, cb.from_user.id, cb.from_user.full_name)
    except ApiError as e:
        await cb.message.answer(f"⚠️ {html.escape(str(e))}")


# ---- /learn wizard ----
@router.message(Command("learn"))
async def learn_start(msg: Message, state: FSMContext):
    await state.clear()
    if not await _require_login(msg, msg.from_user.id, msg.from_user.full_name):
        return
    await state.set_state(Learn.topic)
    await msg.answer("What do you want to learn? <i>(e.g. PostgreSQL indexing)</i>")


@router.message(Learn.topic, F.text, ~F.text.startswith("/"))
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


@router.message(Learn.goal, F.text, ~F.text.startswith("/"))
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
async def cmd_courses(msg: Message, state: FSMContext):
    await state.clear()
    if not await _require_login(msg, msg.from_user.id, msg.from_user.full_name):
        return
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
async def cmd_me(msg: Message, state: FSMContext):
    await state.clear()
    try:
        acc = (await api.get_account(msg.from_user.id, msg.from_user.full_name))[
            "account"
        ]
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer(render_account_text(acc))


# ---- /review (spaced repetition) ----
async def _send_next_review(target, telegram_id):
    try:
        data = await api.get_reviews(telegram_id)
    except ApiError as e:
        await target.answer(f"⚠️ {html.escape(str(e))}")
        return
    reviews = data.get("reviews") or []
    if not reviews:
        await target.answer(
            "🎉 Nothing to review right now. Complete lessons to schedule "
            "spaced-repetition reviews, and check back later!"
        )
        return
    r = reviews[0]
    title = html.escape(r.get("title") or "this lesson")
    course = html.escape(r.get("courseTitle") or "")
    text = (
        f"🧠 <b>Review</b> ({len(reviews)} due)\n\n"
        f"Do you still remember:\n<b>{title}</b>"
    )
    if course:
        text += f"\n<i>{course}</i>"
    await target.answer(text, reply_markup=review_grade_kb(r["lessonId"]))


@router.message(Command("review"))
async def cmd_review(msg: Message, state: FSMContext):
    await state.clear()
    if not await _require_login(msg, msg.from_user.id, msg.from_user.full_name):
        return
    await _send_next_review(msg, msg.from_user.id)


@router.callback_query(F.data.startswith("rev:"))
async def cb_review_grade(cb: CallbackQuery):
    _, lesson_id, flag = cb.data.split(":")
    remembered = flag == "1"
    try:
        res = await api.grade_review(cb.from_user.id, lesson_id, remembered)
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:
        pass
    if remembered:
        days = res.get("intervalDays", 1)
        await cb.answer(f"Nice! Next review in {days} day(s) 🔁")
    else:
        await cb.answer("No worries — we'll show it again tomorrow.")
    await _send_next_review(cb.message, cb.from_user.id)


# ---- /explore (public catalog) ----
@router.message(Command("explore"))
async def cmd_explore(msg: Message, state: FSMContext):
    await state.clear()
    if not await _require_login(msg, msg.from_user.id, msg.from_user.full_name):
        return
    await state.set_state(Explore.query)
    await msg.answer(
        "🔍 Send a topic to search the public catalog, or send "
        "<b>all</b> to see everything."
    )


@router.message(Explore.query, F.text, ~F.text.startswith("/"))
async def explore_query(msg: Message, state: FSMContext):
    await state.clear()
    q = msg.text.strip()
    if q.lower() == "all":
        q = None
    try:
        courses = (await api.explore_courses(q)).get("courses") or []
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    if not courses:
        await msg.answer("No public courses found. Try a different search.")
        return
    await msg.answer(
        "🌐 <b>Public courses</b>\nTap one to add it to your learning:",
        reply_markup=explore_kb(courses),
    )


@router.callback_query(F.data.startswith("enroll:"))
async def cb_enroll(cb: CallbackQuery):
    course_id = cb.data.split(":", 1)[1]
    try:
        await api.enroll_course(cb.from_user.id, course_id)
        course = (await api.get_course(cb.from_user.id, course_id))["course"]
    except ApiError as e:
        await cb.answer(str(e), show_alert=True)
        return
    await cb.answer("Added to your learning ✅")
    await cb.message.answer(render_course_text(course), reply_markup=course_kb(course))


# ---- /settings ----
async def _start_link_email(target, state: FSMContext):
    await state.set_state(LinkEmail.email)
    await target.answer(
        "✉️ Send me the email you want to link. I'll send a 6-digit "
        "verification code to it.\n\nOnce verified you can log in on the "
        "website with this email, and your courses stay in sync.\n\n"
        "Send /cancel to abort."
    )


@router.message(Command("login"))
async def cmd_login(msg: Message, state: FSMContext):
    await state.clear()
    try:
        acc = (await api.get_account(msg.from_user.id, msg.from_user.full_name))[
            "account"
        ]
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    if acc.get("emailVerified"):
        await msg.answer(
            f"✅ You're already logged in as <b>{html.escape(acc.get('email') or '')}</b>.\n"
            "Use /settings to manage your account, or /signout to log out."
        )
        return
    await msg.answer(
        "🔑 <b>Log in</b>\nHow would you like to sign in?",
        reply_markup=login_methods_kb(),
    )


@router.message(Command("signup"))
async def cmd_signup(msg: Message, state: FSMContext):
    await state.clear()
    try:
        acc = (await api.get_account(msg.from_user.id, msg.from_user.full_name))[
            "account"
        ]
    except ApiError:
        acc = None
    if acc and acc.get("emailVerified") and acc.get("hasPassword"):
        await msg.answer(
            "✅ You already have an account. Use /settings or /signout."
        )
        return
    await _start_link_email(msg, state)


@router.callback_query(F.data == "signup")
async def cb_signup(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    await _start_link_email(cb.message, state)


@router.callback_query(F.data == "loginmenu")
async def cb_loginmenu(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    await cb.message.answer(
        "🔑 <b>Log in</b>\nHow would you like to sign in?",
        reply_markup=login_methods_kb(),
    )


@router.callback_query(F.data == "login:otp")
async def cb_login_otp(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    await _start_link_email(cb.message, state)


@router.callback_query(F.data == "login:pw")
async def cb_login_pw(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    await state.set_state(LoginPw.email)
    await cb.message.answer(
        "🔑 Send the <b>email</b> of your account.\n\nSend /cancel to abort."
    )


@router.message(LoginPw.email, F.text, ~F.text.startswith("/"))
async def login_pw_email(msg: Message, state: FSMContext):
    await state.update_data(email=msg.text.strip())
    await state.set_state(LoginPw.password)
    await msg.answer(
        "Now send your <b>password</b>. I'll delete the message right after."
    )


@router.message(LoginPw.password, F.text, ~F.text.startswith("/"))
async def login_pw_password(msg: Message, state: FSMContext):
    data = await state.get_data()
    email = data.get("email") or ""
    pw = msg.text.strip()
    await state.clear()
    try:
        await msg.delete()
    except Exception:
        pass
    try:
        await api.login_password(msg.from_user.id, email, pw)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}\n\nTry /login again.")
        return
    await msg.answer(
        f"✅ Logged in as <b>{html.escape(email)}</b>. What would you like to do?",
        reply_markup=main_menu_kb(),
    )


@router.callback_query(F.data == "forgot")
async def cb_forgot(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    await state.set_state(Forgot.email)
    await cb.message.answer(
        "🔓 <b>Reset password</b>\nSend the email for your account and I'll "
        "send a reset code.\n\nSend /cancel to abort."
    )


@router.message(Command("forgot"))
async def cmd_forgot(msg: Message, state: FSMContext):
    await state.clear()
    await state.set_state(Forgot.email)
    await msg.answer(
        "🔓 <b>Reset password</b>\nSend the email for your account and I'll "
        "send a reset code.\n\nSend /cancel to abort."
    )


@router.message(Forgot.email, F.text, ~F.text.startswith("/"))
async def forgot_email(msg: Message, state: FSMContext):
    email = msg.text.strip()
    try:
        await api.forgot_start(email)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await state.update_data(email=email)
    await state.set_state(Forgot.code)
    await msg.answer(
        f"📨 If an account exists for <b>{html.escape(email)}</b>, a 6-digit "
        "reset code is on its way.\n\nSend me the code."
    )


@router.message(Forgot.code, F.text, ~F.text.startswith("/"))
async def forgot_code(msg: Message, state: FSMContext):
    await state.update_data(code=msg.text.strip())
    await state.set_state(Forgot.password)
    await msg.answer(
        "Now send your <b>new password</b> (min 8 characters). "
        "I'll delete the message right after."
    )


@router.message(Forgot.password, F.text, ~F.text.startswith("/"))
async def forgot_password(msg: Message, state: FSMContext):
    data = await state.get_data()
    pw = msg.text.strip()
    await state.clear()
    try:
        await msg.delete()
    except Exception:
        pass
    try:
        await api.forgot_reset(data.get("email"), data.get("code"), pw)
    except ApiError as e:
        await msg.answer(
            f"⚠️ {html.escape(str(e))}\n\nStart again with /forgot."
        )
        return
    await msg.answer(
        "✅ Password reset! You can now log in with your new password.\n\n"
        "Use /login to sign in.",
        reply_markup=login_kb(),
    )


@router.message(Command("signout"))
async def cmd_signout(msg: Message, state: FSMContext):
    await state.clear()
    try:
        await api.signout(msg.from_user.id)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    await msg.answer(
        "👋 Signed out. Your courses are safe — log back in anytime.\n\n"
        "Use /login or /signup.",
        reply_markup=login_kb(),
    )


@router.callback_query(F.data == "signout")
async def cb_signout(cb: CallbackQuery, state: FSMContext):
    await cb.answer()
    await state.clear()
    try:
        await api.signout(cb.from_user.id)
    except ApiError as e:
        await cb.message.answer(f"⚠️ {html.escape(str(e))}")
        return
    await cb.message.answer(
        "👋 Signed out. Your courses are safe — log back in anytime.\n\n"
        "Use /login or /signup.",
        reply_markup=login_kb(),
    )


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
async def cmd_settings(msg: Message, state: FSMContext):
    await state.clear()
    try:
        await _show_settings(msg, msg.from_user.id, msg.from_user.full_name)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")


# ---- Email linking ----
@router.callback_query(F.data == "linkemail")
async def cb_linkemail(cb: CallbackQuery, state: FSMContext):
    await _start_link_email(cb.message, state)
    await cb.answer()


@router.message(LinkEmail.email, F.text, ~F.text.startswith("/"))
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


@router.message(LinkEmail.code, F.text, ~F.text.startswith("/"))
async def link_email_code(msg: Message, state: FSMContext):
    email = (await state.get_data()).get("email")
    code = msg.text.strip()
    try:
        res = await api.link_confirm(msg.from_user.id, email, code)
    except ApiError as e:
        await msg.answer(f"⚠️ {html.escape(str(e))}")
        return
    extra = (
        "\n\nYour Telegram courses were merged with your existing website account."
        if res.get("merged")
        else "\n\nYou can now log in on the website with this email too."
    )
    await msg.answer(
        f"✅ Email <b>{html.escape(email)}</b> verified and linked.{extra}"
    )
    # A password is mandatory — make sure the account has one.
    try:
        acc = await _fetch_account(msg.from_user.id, msg.from_user.full_name)
    except ApiError:
        acc = None
    if not (acc or {}).get("hasPassword"):
        await state.set_state(Password.new)
        await state.update_data(signup=True)
        await msg.answer(
            "🔒 <b>Last step:</b> set a password (min 8 characters) so you can "
            "log in with email + password or a one-time code. I'll delete your "
            "message right after."
        )
        return
    await state.clear()
    await msg.answer(
        "🎉 You're all set! What would you like to do?",
        reply_markup=main_menu_kb(),
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
        await state.update_data(signup=True)
        await cb.message.answer(
            "Send a <b>new</b> password (min 8 characters). I'll delete the message "
            "right after. Send /cancel to abort."
        )
    await cb.answer()


@router.message(Password.current, F.text, ~F.text.startswith("/"))
async def pw_current(msg: Message, state: FSMContext):
    await state.update_data(current=msg.text.strip())
    try:
        await msg.delete()
    except Exception:
        pass
    await state.set_state(Password.new)
    await msg.answer("Now send your <b>new</b> password (min 8 characters).")


@router.message(Password.new, F.text, ~F.text.startswith("/"))
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
    if data.get("signup"):
        await msg.answer(
            "🎉 <b>Account ready!</b> Your password is set. "
            "What would you like to do?",
            reply_markup=main_menu_kb(),
        )
    else:
        await msg.answer(
            "✅ Password updated. Your message was deleted for safety.",
            reply_markup=main_menu_kb(),
        )


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


@router.message(Keys.waiting, F.text, ~F.text.startswith("/"))
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
async def cmd_admin(msg: Message, state: FSMContext):
    await state.clear()
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


@router.message(AdminLimit.waiting, F.text, ~F.text.startswith("/"))
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


# ---- Fallback: anything no command or active menu handled ----
@router.message(F.text)
async def fallback(msg: Message, state: FSMContext):
    # Only reached when no command and no active-state handler matched.
    if (await state.get_state()) is not None:
        return
    if (msg.text or "").startswith("/"):
        await msg.answer("🤔 I don't know that command. Tap /help to see what I can do.")
    else:
        await msg.answer(
            "I didn't catch that. Tap /learn to create a course, /explore to "
            "browse public ones, or /help for everything I can do."
        )
