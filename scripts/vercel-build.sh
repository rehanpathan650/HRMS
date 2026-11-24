#!/bin/sh
# Vercel build: generate the Prisma client, apply migrations, build the app.
# Accepts every variable name Vercel's Neon integration may create, so nothing
# has to be copied by hand.
set -e

export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-$POSTGRES_URL}}"
export DIRECT_URL="${DIRECT_URL:-${DATABASE_URL_UNPOOLED:-${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}}}"

# Show which database variables exist (names only, never values).
echo "Database variables present:"
for v in DATABASE_URL DIRECT_URL DATABASE_URL_UNPOOLED POSTGRES_PRISMA_URL POSTGRES_URL POSTGRES_URL_NON_POOLING; do
  eval "val=\${$v}"
  [ -n "$val" ] && echo "  - $v"
done

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: no database URL. In Vercel: Storage → your Neon database → Connect Project (Production)." >&2
  exit 1
fi
case "$DATABASE_URL$DIRECT_URL" in
  *localhost*|*127.0.0.1*)
    echo "ERROR: a database variable points to localhost (copied from your local .env)." >&2
    echo "       Delete DATABASE_URL / DIRECT_URL that contain 'localhost' in Vercel → Settings → Environment Variables." >&2
    exit 1 ;;
esac

npx prisma generate
npx prisma migrate deploy
npx next build
