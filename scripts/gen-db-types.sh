#!/usr/bin/env bash
# Regenerates src/types/database.ts from the linked Supabase project and
# re-applies the "generated file" header (the CLI output has none).
# Run via: bun run db:types
set -euo pipefail

OUT="src/types/database.ts"
PROJECT_REF="aabshwhxzpfpinazcqqh"

# Prefer a stable `supabase` binary on PATH (brew install supabase/tap/supabase).
# bunx downloads the CLI to a new versioned path each time it updates, and macOS
# treats every new path as a new app, so the Keychain re-prompts for the database
# password on every run and "Always Allow" never sticks.
if command -v supabase >/dev/null 2>&1; then
  SUPABASE=(supabase)
else
  echo "note: no 'supabase' on PATH, falling back to bunx." >&2
  echo "      macOS may prompt for your Keychain password several times." >&2
  echo "      Install once to stop this: brew install supabase/tap/supabase" >&2
  SUPABASE=(bunx supabase)
fi

{
  cat <<EOF
/**
 * GENERATED FILE — DO NOT EDIT BY HAND.
 *
 * Mirrors the live Supabase schema for project \`${PROJECT_REF}\`.
 * Regenerate after any migration with:
 *
 *   bun run db:types
 *
 * Requires a one-time \`bunx supabase login\` and
 * \`bunx supabase link --project-ref ${PROJECT_REF}\`.
 */

EOF
  "${SUPABASE[@]}" gen types typescript --linked
} >"$OUT.tmp"

mv "$OUT.tmp" "$OUT"
bunx prettier --write "$OUT" >/dev/null
echo "Wrote $OUT"
