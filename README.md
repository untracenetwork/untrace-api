# untrace-api

The public API reference for Untrace Drive: the OpenAPI 3.1 contract, a static
rendered reference, and an embed for the docs at untrace.network.

Your code encrypts each file on your own machine with one standard step
(AES-256-GCM). Drive only ever receives ciphertext, stores it across 6 regions,
and any 3 recover it. On download you get the same ciphertext back plus the file
key sealed to your key, so only your machine can open it. We cannot read your
files.

## What is in the reference

| Topic | Operations | Status |
|---|---|---|
| Auth | OAuth 2.0 client credentials: client id + client secret for a 15 minute Bearer token | Live |
| Files | List, read metadata and your sealed key, rename, move to trash | Live (move: planned) |
| Upload | Encrypted upload (`UTE1` ciphertext, up to 16 MiB in this version) | Live |
| Download | Ciphertext plus your sealed file key | Live |
| Owner | The owner's sharing public key, signed | Live |
| Folders | Create, list, rename, move, trash | Planned |
| Keys | Key entries on a folder or a file: role, scopes, explicit block | Planned |
| Sharing | Offer to a username; the recipient attaches their own key | Planned |

Every operation carries `x-status: live` or `x-status: planned`. Planned
operations are part of the contract and answer 404 until they ship.

## Authentication in one call

A developer key is created in Drive under Settings, Developer keys, and shown
once as a client id (`utc_...`) and a client secret. The secret stays on your
machine. Your code derives the OAuth `client_secret` from it (label
`untrace:client-key:oauth:v1`, see "Client credentials" in the reference) and
exchanges it for a token:

```sh
curl -s https://drive.untrace.network/api/v1/oauth/token \
  -d grant_type=client_credentials \
  -d client_id="$UNTRACE_CLIENT_ID" \
  -d client_secret="$UNTRACE_OAUTH_SECRET"
```

The account that owns the key needs an active plan; without one the token
endpoint answers 402. The Untrace SDK does the derivation and the encryption for
you.

## Layout

| Path | What it is |
|---|---|
| `spec/openapi.yaml` | The contract. A byte-for-byte copy of Drive's `docs/api/openapi.yaml`. |
| `spec/SOURCE.json` | Where the copy came from: Drive commit and sha256. |
| `scripts/build.mjs` | Renders the spec to `dist/` (static HTML, no JavaScript, no web fonts, no tracking). |
| `embed/` | The rendered reference as an HTML fragment and an ES module, for untrace.network/docs/api. See `embed/README.md`. |
| `scripts/check-spec.mjs` | Validates against the OpenAPI 3.1 schema; refs, topics, statuses, no internals. |
| `scripts/check-drive.mjs` | Every documented path and method exists in Drive's spec at the pinned commit with the same status, and every live operation has a Drive route. |
| `scripts/check-public.mjs` | The public gate in docs mode: no core names, no crypto calls, no secrets, no private hosts; static output only; embed in sync. |

## Develop

Node.js 22 or newer.

```sh
npm ci
npm run check:spec
npm run build          # dist/index.html, dist/openapi.{yaml,json}, dist/embed/
cp dist/embed/* embed/
npm run check:public
npm test
DRIVE_READ_TOKEN=... npm run check:drive
```

To pick up a new Drive contract: `scripts/sync-spec.sh <drive-ref>`, then
rebuild, copy the embed and run the checks. Edit the contract in Drive, never
here: CI fails if this copy differs from Drive at the pinned commit.

## Licence

Apache-2.0. See `LICENSE`.
