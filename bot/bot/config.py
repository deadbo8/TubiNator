import os

# Telegram bot token from @BotFather
BOT_TOKEN = os.environ.get("BOT_TOKEN", "")

# Base URL of the Tubinator web API (inside the Docker network).
API_BASE_URL = os.environ.get("API_BASE_URL", "http://web:3000").rstrip("/")

# Shared secret that authenticates the bot to the /api/bot/* endpoints.
BOT_API_SECRET = os.environ.get("BOT_API_SECRET", "")
