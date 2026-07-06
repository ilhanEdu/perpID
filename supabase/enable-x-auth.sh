#!/usr/bin/env bash
# Enables "Sign in with X" on the Supabase project once you have X app keys.
#
# 1. Create an app at https://developer.x.com (free tier is fine) with
#    OAuth 1.0a enabled and this callback URL:
#      https://utcydlsestafopphkijn.supabase.co/auth/v1/callback
# 2. Run:
#      SUPABASE_ACCESS_TOKEN=sbp_... X_API_KEY=... X_API_SECRET=... \
#        bash supabase/enable-x-auth.sh
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (sbp_...)}"
: "${X_API_KEY:?set X_API_KEY (X app API key / consumer key)}"
: "${X_API_SECRET:?set X_API_SECRET (X app API secret)}"

PROJECT_REF="utcydlsestafopphkijn"

curl -sf -X PATCH \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"external_twitter_enabled\": true,
    \"external_twitter_client_id\": \"$X_API_KEY\",
    \"external_twitter_secret\": \"$X_API_SECRET\"
  }" \
  "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  | python3 -c "import json,sys; c=json.load(sys.stdin); print('twitter_enabled =', c.get('external_twitter_enabled'))"

echo "Done — the Connect 𝕏 button on /v3 now uses real X login."
