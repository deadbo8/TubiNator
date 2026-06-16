from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

LEVELS = ["Beginner", "Intermediate", "Advanced"]


def level_kb() -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(text=lv, callback_data=f"level:{lv}")] for lv in LEVELS]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def courses_kb(courses) -> InlineKeyboardMarkup:
    rows = []
    for c in courses:
        label = f"{c['title']} ({c['done']}/{c['total']})"
        rows.append(
            [InlineKeyboardButton(text=label[:60], callback_data=f"course:{c['id']}")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _lesson_done(lesson) -> bool:
    prog = lesson.get("progress") or []
    return bool(prog) and bool(prog[0].get("completed"))


def course_kb(course) -> InlineKeyboardMarkup:
    rows = []
    for module in course["modules"]:
        for lesson in module["lessons"]:
            done = _lesson_done(lesson)
            watch = InlineKeyboardButton(
                text=f"{'✅' if done else '▶️'} {lesson['title']}"[:55],
                callback_data=f"watch:{lesson['id']}",
            )
            toggle = InlineKeyboardButton(
                text="☑️" if done else "⬜",
                callback_data=f"toggle:{lesson['id']}:{0 if done else 1}",
            )
            rows.append([watch, toggle])
    rows.append([InlineKeyboardButton(text="📚 My courses", callback_data="mycourses")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def settings_kb(account) -> InlineKeyboardMarkup:
    """Settings menu mirroring the website: email, password, and BYOK keys."""
    rows = []
    if account.get("emailVerified"):
        pw_label = "🔒 Change password" if account.get("hasPassword") else "🔒 Set password"
        rows.append([InlineKeyboardButton(text=pw_label, callback_data="setpw")])
    else:
        rows.append(
            [InlineKeyboardButton(text="✉️ Link & verify email", callback_data="linkemail")]
        )
    groq_label = (
        "🔑 Update Groq key" if account.get("usingOwnGroq") else "🔑 Add Groq key"
    )
    yt_label = (
        "🔑 Update YouTube key"
        if account.get("usingOwnYoutube")
        else "🔑 Add YouTube key"
    )
    rows.append([InlineKeyboardButton(text=groq_label, callback_data="setkey:groq")])
    rows.append([InlineKeyboardButton(text=yt_label, callback_data="setkey:youtube")])
    clear_row = []
    if account.get("usingOwnGroq"):
        clear_row.append(
            InlineKeyboardButton(text="🗑 Clear Groq", callback_data="clearkey:groq")
        )
    if account.get("usingOwnYoutube"):
        clear_row.append(
            InlineKeyboardButton(text="🗑 Clear YouTube", callback_data="clearkey:youtube")
        )
    if clear_row:
        rows.append(clear_row)
    if account.get("isAdmin"):
        rows.append(
            [InlineKeyboardButton(text="🛡 Admin panel", callback_data="admin")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def review_grade_kb(lesson_id) -> InlineKeyboardMarkup:
    """Grade buttons for a spaced-repetition flashcard."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="😕 Forgot", callback_data=f"rev:{lesson_id}:0"
                ),
                InlineKeyboardButton(
                    text="😊 Remembered", callback_data=f"rev:{lesson_id}:1"
                ),
            ]
        ]
    )


def explore_kb(courses) -> InlineKeyboardMarkup:
    """List of public courses; tap to add one to your learning."""
    rows = []
    for c in courses:
        label = f"{c['title']} ({c['lessons']} lessons)"
        rows.append(
            [
                InlineKeyboardButton(
                    text=label[:60], callback_data=f"enroll:{c['id']}"
                )
            ]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_users_kb(users) -> InlineKeyboardMarkup:
    """One row per user; tap to open that user's management actions."""
    rows = []
    for u in users:
        flags = ""
        if u.get("banned"):
            flags += " 🚫"
        if u.get("isAdmin"):
            flags += " ⭐"
        label = (u.get("email") or u.get("name") or "(no email)") + flags
        rows.append(
            [InlineKeyboardButton(text=label[:60], callback_data=f"au:{u['id']}")]
        )
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_user_actions_kb(user) -> InlineKeyboardMarkup:
    uid = user["id"]
    banned = user.get("banned")
    rows = [
        [
            InlineKeyboardButton(
                text="✅ Unban" if banned else "🚫 Ban",
                callback_data=f"a{'unban' if banned else 'ban'}:{uid}",
            )
        ],
        [InlineKeyboardButton(text="🎚 Set daily limit", callback_data=f"alim:{uid}")],
        [InlineKeyboardButton(text="♻️ Reset limit to default", callback_data=f"alimdef:{uid}")],
        [InlineKeyboardButton(text="🗑 Delete account", callback_data=f"adel:{uid}")],
        [InlineKeyboardButton(text="⬅️ Back to list", callback_data="admin")],
    ]
    return InlineKeyboardMarkup(inline_keyboard=rows)


def admin_delete_confirm_kb(uid) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="☠️ Yes, delete", callback_data=f"adelyes:{uid}"
                ),
                InlineKeyboardButton(text="Cancel", callback_data=f"au:{uid}"),
            ]
        ]
    )
