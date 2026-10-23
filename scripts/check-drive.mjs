// check:drive: every path and method documented here exists in Untrace Drive.
//
// Two layers:
//   1. Spec parity. The Drive spec at the pinned commit (spec/SOURCE.json) must
//      document every path + method in this repo with the same x-status, and
//      the two files must be identical.
//   2. Routes. Every LIVE operation must have a route file at the pinned Drive
//      commit that exports that HTTP method. Planned operations must not.
//
// Drive is a private repository, so this needs a token with read access to
// untracenetwork/untrace-drive in DRIVE_READ_TOKEN (or GH_TOKEN / GITHUB_TOKEN
// locally). DRIVE_REF overrides the pinned commit, for example to check the
// copy against Drive main before a sync.
//
// Without a token: fails, unless DRIVE_CHECK_OPTIONAL=1, in which case it
// prints SKIPPED and exits 0 (CI sets this only when the secret is missing,
// and says so in the job summary).
import { createHash } from "node:crypto"
import yaml from "js-yaml"
import { loadSource, loadSpec, loadSpecText, operations } from "./lib.mjs"

const source = loadSource()
const ref = process.env.DRIVE_REF || source.commit
const token = process.env.DRIVE_READ_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN
const repo = source.repository

if (!token) {
  const msg = "check:drive SKIPPED: no DRIVE_READ_TOKEN, so Drive (private) could not be read."
  if (process.env.DRIVE_CHECK_OPTIONAL === "1") {
    console.log(msg)
    process.exit(0)
  }
  console.log(msg.replace("SKIPPED", "FAILED"))
  process.exit(1)
}

async function gh(pathname, accept = "application/vnd.github.raw+json") {
  const res = await fetch(`https://api.github.com/repos/${repo}/${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "untrace-api-check" },
  })
  return res
}

let assertions = 0
let failures = 0
function ok(label, cond, detail) {
  assertions++
  if (cond) console.log(`  ok    ${label}`)
  else {
    failures++
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

console.log(`Drive ${repo} at ${ref}`)
const specRes = await gh(`contents/${source.path}?ref=${encodeURIComponent(ref)}`)
ok(`Drive serves ${source.path} at ${ref}`, specRes.ok, `HTTP ${specRes.status}`)
if (!specRes.ok) {
  console.log(`\ncheck:drive: ${assertions - failures}/${assertions} assertions passed`)
  process.exit(1)
}
const driveText = await specRes.text()
const drive = yaml.load(driveText)
const mine = loadSpec()
const mineText = loadSpecText()

const sha = (t) => createHash("sha256").update(t).digest("hex")
ok("this copy is byte-identical to the Drive spec", sha(driveText) === sha(mineText), `drive ${sha(driveText)} vs here ${sha(mineText)}`)

// Layer 1: every documented path + method exists in Drive's spec, same status.
for (const { path, method, op } of operations(mine)) {
  const d = drive.paths?.[path]?.[method]
  ok(`${method.toUpperCase()} ${path} is in the Drive spec`, !!d)
  if (d) ok(`${method.toUpperCase()} ${path} has the same x-status (${op["x-status"]})`, d["x-status"] === op["x-status"], `drive says ${d["x-status"]}`)
}

// Layer 2: live operations are served by a Drive route file at that commit.
const routeFile = (p) => "app" + p.replace(/\{(\w+)\}/g, "[$1]") + "/route.ts"
const cache = new Map()
async function routeSource(file) {
  if (!cache.has(file)) {
    const r = await gh(`contents/${file}?ref=${encodeURIComponent(ref)}`)
    cache.set(file, r.ok ? await r.text() : null)
  }
  return cache.get(file)
}
for (const { path, method, op } of operations(mine)) {
  const file = routeFile(path)
  const src = await routeSource(file)
  const exported = !!src && new RegExp(`^export (const|async function|function) ${method.toUpperCase()}\\b`, "m").test(src)
  if (op["x-status"] === "live") ok(`live ${method.toUpperCase()} ${path} is served by ${file}`, exported)
  else ok(`planned ${method.toUpperCase()} ${path} is not served yet`, !exported, `${file} exports it: mark it live`)
}

console.log(`\ncheck:drive: ${assertions - failures}/${assertions} assertions passed`)
if (failures) process.exit(1)
