#!/usr/bin/env bash
# sync-spec.sh <drive-ref>: copy docs/api/openapi.yaml from untrace-drive at a
# commit, branch or tag, and pin it in spec/SOURCE.json. Needs gh, logged in
# with read access to untracenetwork/untrace-drive.
set -euo pipefail
ref="${1:?usage: scripts/sync-spec.sh <drive-ref>}"
cd "$(dirname "$0")/.."
sha=$(gh api "repos/untracenetwork/untrace-drive/commits/$ref" --jq .sha)
gh api -H "Accept: application/vnd.github.raw+json" "repos/untracenetwork/untrace-drive/contents/docs/api/openapi.yaml?ref=$sha" > spec/openapi.yaml
digest=$(sha256sum spec/openapi.yaml | cut -d' ' -f1)
branch=$(git -C . rev-parse --abbrev-ref HEAD)
node -e '
const fs = require("fs")
const p = "spec/SOURCE.json"
const s = JSON.parse(fs.readFileSync(p, "utf8"))
s.commit = process.argv[1]
s.sha256 = process.argv[2]
s.branch = process.argv[3]
fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n")
' "$sha" "$digest" "$ref"
echo "spec/openapi.yaml <- untrace-drive@$sha ($digest) on $branch"
echo "next: npm run build && cp dist/embed/* embed/ && npm run check"
