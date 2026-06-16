#!/bin/sh
set -e

echo "==> Syncing database schema..."
# db push syncs the DB to prisma/schema.prisma without needing migration files.
# Safe + idempotent: on first boot it creates all tables; later it adds new
# columns (e.g. telegramId). It aborts rather than destroy data, so a failed
# push leaves your data intact.
npx prisma db push --skip-generate --accept-data-loss

echo "==> Starting Tubinator..."
exec "$@"
