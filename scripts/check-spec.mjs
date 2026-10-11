// check:spec: the copied OpenAPI document is valid, complete and free of internals.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { Validator } from "@seriousme/openapi-schema-validator"
import { SPEC_PATH, TOPICS, collectRefs, loadSource, loadSpec, loadSpecText, operations, resolveRef } from "./lib.mjs"
import { BANNED } from "./banned.mjs"

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

const text = loadSpecText()
const doc = loadSpec(text)
const source = loadSource()

// 1. Provenance: the file is exactly the one recorded in SOURCE.json.
const sha = createHash("sha256").update(readFileSync(SPEC_PATH)).digest("hex")
ok("spec/openapi.yaml matches the sha256 recorded in spec/SOURCE.json", sha === source.sha256, `got ${sha}`)
ok("SOURCE.json pins a full 40-character Drive commit", /^[0-9a-f]{40}$/.test(source.commit))

// 2. Schema validation against the official OpenAPI 3.1 meta-schema.
const validator = new Validator()
const res = await validator.validate(doc)
ok("the spec is valid OpenAPI (official 3.1 schema)", res.valid, JSON.stringify(res.errors)?.slice(0, 600))
ok("the spec declares OpenAPI 3.1.x", /^3\.1\.\d+$/.test(String(doc.openapi)))
ok("the licence in the spec is Apache-2.0", doc.info?.license?.identifier === "Apache-2.0")

// 3. Every $ref resolves.
const refs = [...collectRefs(doc)]
const unresolved = refs.filter((r) => resolveRef(doc, r) === undefined)
ok(`every $ref resolves (${refs.length} refs)`, unresolved.length === 0, unresolved.join(", "))

// 4. Every operation: status, unique id, tag that exists, summary, responses.
const ops = operations(doc)
const tagNames = new Set((doc.tags ?? []).map((t) => t.name))
const ids = new Set()
let live = 0
let planned = 0
for (const { path, method, op } of ops) {
  const name = `${method.toUpperCase()} ${path}`
  const st = op["x-status"]
  ok(`${name}: x-status is live or planned`, st === "live" || st === "planned")
  if (st === "live") live++
  else planned++
  ok(`${name}: unique operationId`, typeof op.operationId === "string" && !ids.has(op.operationId))
  ids.add(op.operationId)
  ok(`${name}: tagged with a declared tag`, Array.isArray(op.tags) && op.tags.length > 0 && op.tags.every((t) => tagNames.has(t)))
  ok(`${name}: has a summary and at least one 2xx response`, !!op.summary && Object.keys(op.responses ?? {}).some((c) => /^2/.test(c)))
  if (path !== "/api/v1/oauth/token") {
    const sec = op.security ?? doc.security
    ok(`${name}: protected by the Bearer token`, Array.isArray(sec) && sec.some((s) => "bearerAuth" in s))
  }
}
ok(`operations counted (${live} live, ${planned} planned)`, ops.length > 0 && live > 0)

// 5. Topic coverage required by the reference: auth, folders, files, upload,
//    download, keys on folder and file, sharing.
for (const t of TOPICS) ok(`topic "${t}" has at least one operation`, ops.some((o) => o.op.tags?.includes(t)))
const has = (m, p) => !!doc.paths?.[p]?.[m]
ok("auth: client credentials token endpoint documented", has("post", "/api/v1/oauth/token"))
ok("auth: OAuth client credentials flow declared", !!doc.components?.securitySchemes?.oauthClientCredentials?.flows?.clientCredentials)
ok("upload documented", has("post", "/api/v1/files/upload"))
ok("download documented", has("get", "/api/v1/files/{fileId}/content"))
ok("keys on a file documented", has("post", "/api/v1/files/{fileId}/keys"))
ok("keys on a folder documented", has("post", "/api/v1/folders/{folderId}/keys"))
ok("sharing documented", has("post", "/api/v1/shares") && has("post", "/api/v1/shares/{shareId}/accept"))
ok("token lifetime is 15 minutes", doc.components?.schemas?.TokenResponse?.properties?.expires_in?.const === 900)

// 6. Planned work is labelled as planned in its tag description.
for (const t of doc.tags ?? []) {
  const tops = ops.filter((o) => o.op.tags?.includes(t.name))
  if (tops.length && tops.every((o) => o.op["x-status"] === "planned"))
    ok(`tag "${t.name}" (all planned) says Planned in its description`, /planned/i.test(t.description ?? ""))
}

// 7. No internals, no em dashes; required public copy present.
for (const [re, why] of BANNED) {
  const m = text.match(re)
  ok(`no ${why} in the spec text (${re})`, !m, m ? `found "${m[0]}"` : "")
}
ok('public copy says "6 regions" and "any 3 recover"', /6 regions/.test(text) && /any 3 recover/.test(text))
ok("no http:// server URLs", (doc.servers ?? []).every((s) => String(s.url).startsWith("https://")))

console.log(`\ncheck:spec: ${assertions - failures}/${assertions} assertions passed`)
if (failures) process.exit(1)
