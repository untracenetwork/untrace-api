import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { escapeHtml, loadSpec, operations, resolveRef, collectRefs, TOPICS } from "../scripts/lib.mjs"
import { BANNED } from "../scripts/banned.mjs"

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

test("operations() lists 25 operations, 8 of them live", () => {
  const ops = operations(doc)
  assert.equal(ops.length, 25)
  assert.equal(ops.filter((o) => o.op["x-status"] === "live").length, 8)
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
