import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand

from . import api
from .config import BOT_API_SECRET, BOT_TOKEN
from .handlers import router


async def main():
    logging.basicConfig(level=logging.INFO)
    if not BOT_TOKEN:
        raise SystemExit("BOT_TOKEN is not set")
    if not BOT_API_SECRET:
        raise SystemExit("BOT_API_SECRET is not set")

    bot = Bot(
        token=BOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher(storage=MemoryStorage())
    dp.include_router(router)

    await bot.set_my_commands(
        [
            BotCommand(command="learn", description="Create a new course"),
            BotCommand(command="courses", description="View your courses"),
            BotCommand(command="me", description="Your account & usage"),
            BotCommand(command="settings", description="Email, password & API keys"),
            BotCommand(command="admin", description="Admin panel (admins only)"),
            BotCommand(command="help", description="How to use the bot"),
        ]
    )

    try:
        await dp.start_polling(bot)
    finally:
        await api.close()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(main())
