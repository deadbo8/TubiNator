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


def settings_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔑 Set Groq key", callback_data="setkey:groq")],
            [
                InlineKeyboardButton(
                    text="🔑 Set YouTube key", callback_data="setkey:youtube"
                )
            ],
            [
                InlineKeyboardButton(
                    text="🗑 Clear Groq", callback_data="clearkey:groq"
                ),
                InlineKeyboardButton(
                    text="🗑 Clear YouTube", callback_data="clearkey:youtube"
                ),
            ],
        ]
    )
