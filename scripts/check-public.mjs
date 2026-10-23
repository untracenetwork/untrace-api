// check:public: the untrace-core leak gate, in "docs mode", for this repo.
//
// untrace-core scripts/public/leak-gate.sh is written for app and SDK repos.
// This repo ships documentation only, and the option-B contract (JC 2026-10-11)
// requires the reference to NAME the one client-side step a developer runs
// (AES-256-GCM, a key derivation with the public client-key labels, an X25519
// sealed box). So, compared with leak-gate.sh:
//
//   - rules 1, 2, 3 (core names), 5 (private infra) apply to every file;
//   - rule 3b (crypto) applies to code: no encryption call anywhere, and the
//     only derivation labels allowed in any file are the public client-key ones;
//   - rule 4 (secrets) applies to every file; the bare secret PREFIX in the
//     contract is fine, a prefix followed by key material is not;
//   - rule 7 (core.lock) does not apply: nothing here links the core;
//   - new: built output has no script, no remote load, no tracking, and the
//     committed embed/ copy equals a fresh build.
// All patterns live in banned.mjs, written so that this tree passes a plain
// grep for them too.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { BANNED, GATE } from "./banned.mjs"
import { ROOT } from "./lib.mjs"

const { NATIVE, PRIVATE_DIR, SECRET, PRIVATE_INFRA, CORE_NAMES, CRYPTO_CALL, LABEL, ALLOWED_LABELS } = GATE
const TEXT = /\.(m?[jt]sx?|c?js|json|ya?ml|md|txt|html|css)$/

process.chdir(ROOT)
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => existsSync(f))

const hits = []
const hit = (f, why) => hits.push(`${f}: ${why}`)

for (const f of files) {
  if (NATIVE.test(f)) hit(f, "native or compiled code")
  if (PRIVATE_DIR.test(f)) hit(f, "private folder")
  if (!TEXT.test(f) && path.basename(f) !== "LICENSE") continue
  const text = readFileSync(f, "utf8")
  const s = text.match(SECRET)
  if (s) hit(f, `secret pattern (${s[0].slice(0, 16)}...)`)
  const pi = text.match(PRIVATE_INFRA)
  if (pi) hit(f, `private infra reference (${pi[0]})`)
  const cn = text.match(CORE_NAMES)
  if (cn) hit(f, `core algorithm or key-derivation name (${cn[0]})`)
  if (/\.(m?[jt]sx?|c?js)$/.test(f)) {
    const cc = text.match(CRYPTO_CALL)
    // scripts may hash with createHash (sha256 provenance); that is not encryption.
    if (cc) hit(f, `crypto primitive call (${cc[0]})`)
  }
  for (const label of text.match(LABEL) ?? []) if (!ALLOWED_LABELS.has(label)) hit(f, `key-derivation label ${label}`)
  // Public copy (docs, spec, built embed): the full no-internals word list.
  if ((/\.(md|html|ya?ml)$/.test(f) && !f.startsWith(".github/")) || f.startsWith("embed/")) {
    if (/\u2014/.test(text)) hit(f, "em dash in public copy")
    for (const [re, why] of BANNED) {
      if (why === "em dash in public copy") continue
      const m = text.match(re)
      if (m) hit(f, `${why} (${m[0]})`)
    }
  }
}

// Licence.
if (!existsSync("LICENSE") || !/Apache License\s+Version 2\.0, January 2004/.test(readFileSync("LICENSE", "utf8"))) hit("LICENSE", "not the Apache-2.0 licence")
const pkg = JSON.parse(readFileSync("package.json", "utf8"))
if (pkg.license !== "Apache-2.0") hit("package.json", `license is ${pkg.license}`)

// Built output: static, no scripts, no remote loads, no tracking.
const NO_RUNTIME = [
  [/<script\b/i, "a <script> tag"],
  [/<(iframe|object|embed)\b/i, "a nested frame or plugin"],
  [/<link\b[^>]*rel=["']?(stylesheet|preload|prefetch|preconnect|dns-prefetch)/i, "an external stylesheet or preload"],
  [/@import\b/i, "a CSS @import"],
  [/url\(\s*["']?(https?:)?\/\//i, "a remote CSS url()"],
  [/\s(src|srcset|poster|data)=["']?(https?:)?\/\//i, "a remote resource"],
  [/\son[a-z]+=/i, "an inline event handler"],
  [/google-analytics|googletagmanager|gtag\(|plausible|segment\.|mixpanel|hotjar|cloudflareinsights|sentry/i, "tracking"],
  [/javascript:/i, "a javascript: URL"],
]
function scanBuilt(f) {
  const text = readFileSync(f, "utf8")
  const body = f.endsWith(".mjs") ? JSON.parse(text.match(/export const html = (".*")\n/s)[1]) : text
  for (const [re, why] of NO_RUNTIME) if (re.test(body)) hit(f, `built output has ${why}`)
  // A link to the Drive host is fine as text in <code>; anything else external must be an <a href>.
}
if (!existsSync("dist/index.html")) hit("dist/", "missing: run npm run build first")
else {
  for (const f of ["dist/index.html", "dist/embed/reference.html", "dist/embed/reference.mjs"]) scanBuilt(f)
  // The committed embed copy is exactly the fresh build.
  for (const name of readdirSync("dist/embed")) {
    const committed = path.join("embed", name)
    if (!existsSync(committed)) hit(committed, "missing: copy it from dist/embed (npm run build && cp dist/embed/* embed/)")
    else if (readFileSync(committed, "utf8") !== readFileSync(path.join("dist/embed", name), "utf8")) hit(committed, "differs from a fresh build: run npm run build && cp dist/embed/* embed/")
  }
}

if (hits.length) {
  console.log("check:public FAILED")
  for (const h of hits) console.log(`  ${h}`)
  process.exit(1)
}
console.log(`check:public: clean (${files.length} tracked files, docs mode)`)
