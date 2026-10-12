import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { escapeHtml, loadSpec, operations, resolveRef, collectRefs, TOPICS } from "../scripts/lib.mjs"
import { BANNED, GATE } from "../scripts/banned.mjs"

const doc = loadSpec()

test("escapeHtml escapes every HTML-significant character", () => {
  assert.equal(escapeHtml(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;")
})

test("resolveRef resolves local pointers and rejects others", () => {
  assert.equal(resolveRef(doc, "#/components/schemas/File").type, "object")
  assert.equal(resolveRef(doc, "#/components/schemas/Nope"), undefined)
  assert.equal(resolveRef(doc, "https://example.com/x"), undefined)
})

test("every $ref in the spec resolves", () => {
  for (const r of collectRefs(doc)) assert.notEqual(resolveRef(doc, r), undefined, r)
})

test("operations() lists 25 operations, all live on Drive main", () => {
  const ops = operations(doc)
  assert.equal(ops.length, 25)
  assert.equal(ops.filter((o) => o.op["x-status"] === "live").length, 25)
})

test("every required topic is a tag in the spec", () => {
  const tags = new Set(doc.tags.map((t) => t.name))
  for (const t of TOPICS) assert.ok(tags.has(t), t)
})

test("the no-internals list catches what it is meant to catch", () => {
  const hits = (s) => BANNED.filter(([re]) => re.test(s)).map(([, why]) => why)
  assert.ok(hits("stored as 6 shards").length)
  assert.ok(hits("runs on 3 nodes").length)
  assert.ok(hits("signed HS256 JWT").length)
  assert.ok(hits("an S3 bucket").length)
  assert.ok(hits("a \u2014 dash").length)
  assert.deepEqual(hits("Drive stores it across 6 regions; any 3 recover it."), [])
})

test("the built fragment is static and escapes the spec", () => {
  const html = readFileSync(new URL("../embed/reference.html", import.meta.url), "utf8")
  assert.ok(!/<script\b/i.test(html))
  assert.ok(!/\son[a-z]+=/i.test(html))
  assert.ok(html.startsWith('<div class="uapi"'))
  for (const { op } of operations(doc)) assert.ok(html.includes(`id="op-${op.operationId.toLowerCase()}"`), op.operationId)
  assert.ok(html.includes("6 regions"))
})

test("the module export equals the HTML fragment", async () => {
  const mod = await import("../embed/reference.mjs")
  const html = readFileSync(new URL("../embed/reference.html", import.meta.url), "utf8")
  assert.equal(mod.html, html)
  assert.equal(mod.version, doc.info.version)
  assert.match(mod.sourceCommit, /^[0-9a-f]{40}$/)
})

test("the label gate allows the public contract labels and nothing else", () => {
  const labels = (s) => (s.match(GATE.LABEL) ?? []).filter((l) => !GATE.ALLOWED_LABELS.has(l))
  assert.deepEqual(labels("untrace:client-key:oauth:v1 untrace:folder-key:box:v1"), [])
  const other = ["untrace", "folder-key", "wrap", "v1"].join(":") // built at runtime so the gate does not flag this file
  assert.deepEqual(labels(other), [other])
  // Core key-derivation labels are refused by CORE_NAMES (built at runtime so this file stays clean).
  assert.ok(GATE.CORE_NAMES.test("untrace:file-" + "kek"))
})

test("upload documents the required folder and folder_access_required", () => {
  const up = doc.paths["/api/v1/files/upload"].post
  const folder = up.parameters.find((p) => p.name === "X-Untrace-Folder-Id")
  assert.equal(folder.required, true)
  assert.match(folder.description, /folder_access_required/)
  assert.equal(up.parameters.find((p) => p.name === "X-Untrace-Folder-Sealed-Key").required, true)
})
