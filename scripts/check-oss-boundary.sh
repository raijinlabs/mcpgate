#!/usr/bin/env bash
# check-oss-boundary.sh — CI guard preventing OSS code from statically importing cloud/
#
# Allowed: dynamic imports in app entry points (await import('...cloud/...'))
# Blocked: static imports (import ... from '...cloud/...')
#          static type-only imports (import type ... from '...cloud/...')
#
# Exit code 0 = clean, 1 = violations found

set -euo pipefail

VIOLATIONS=0

echo "Checking OSS → cloud/ boundary..."

# Search for static imports of cloud/ in OSS directories
# Exclude: test files, plan docs, this script itself
for dir in apps modules packages; do
  while IFS= read -r line; do
    # Skip dynamic imports (await import(...))
    if echo "$line" | grep -qE 'await\s+import\('; then
      continue
    fi
    echo "  VIOLATION: $line"
    VIOLATIONS=$((VIOLATIONS + 1))
  done < <(grep -rn --include='*.ts' --include='*.tsx' -E "^import .+from.+cloud/" "$dir" 2>/dev/null || true)
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "FAIL: Found $VIOLATIONS static import(s) from cloud/ in OSS code."
  echo "OSS code (apps/, modules/, packages/) must not statically import from cloud/."
  echo "Use dynamic imports (await import(...)) in app entry points if needed."
  exit 1
else
  echo "PASS: No OSS → cloud/ boundary violations found."
  exit 0
fi
