#!/bin/sh
# Vercel build: generate the Prisma client, apply migrations, build the app.
# Accepts the variable names created by Vercel's Neon integration, so DIRECT_URL
# doesn't have to be copied by hand.
set -e

export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-$POSTGRES_URL_NON_POOLING}}"
if [ -z "$DATABASE_URL" ] || [ -z "$DIRECT_URL" ]; then
  echo "Missing database variables: connect Neon under Vercel → Storage, or set DATABASE_URL and DIRECT_URL." >&2
  exit 1
fi

npx prisma generate
npx prisma migrate deploy
npx next build
