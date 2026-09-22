#!/usr/bin/env bash
# Regenerates src/types/database.ts from the linked Supabase project and
# re-applies the "generated file" header (the CLI output has none).
# Run via: bun run db:types
set -euo pipefail

OUT="src/types/database.ts"
PROJECT_REF="aabshwhxzpfpinazcqqh"

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
  bunx supabase gen types typescript --linked
} >"$OUT.tmp"

mv "$OUT.tmp" "$OUT"
bunx prettier --write "$OUT" >/dev/null
echo "Wrote $OUT"
