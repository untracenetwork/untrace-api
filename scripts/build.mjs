// build: render spec/openapi.yaml into a static reference with no JavaScript,
// no web fonts, no third-party requests and no tracking.
//
// Outputs (dist/ is not committed):
//   dist/index.html                 full page (own CSP: no scripts, no remote loads)
//   dist/openapi.yaml, openapi.json the contract, for tools and agents
//   dist/embed/reference.html       body fragment, scoped under .uapi, for embedding
//   dist/embed/reference.mjs        the same fragment as an ES module string
//
// The committed copies in embed/ must match dist/embed (check:public enforces it),
// so untrace-landing can vendor them without running this build.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Marked } from "marked"
import { ROOT, TOPICS, escapeHtml as esc, loadSource, loadSpec, loadSpecText, operations } from "./lib.mjs"

const DIST = path.join(ROOT, "dist")
const doc = loadSpec()
const text = loadSpecText()
const source = loadSource()
const CSS = readFileSync(path.join(ROOT, "scripts", "reference.css"), "utf8")

// Markdown: raw HTML in the spec is escaped, headings are demoted one level.
const md = new Marked({ gfm: true, breaks: false })
md.use({
  walkTokens(t) {
    if (t.type === "heading") t.depth = Math.min(6, t.depth + 2)
  },
  renderer: {
    html(token) {
      return esc(token.text ?? token.raw ?? "")
    },
  },
})
const mdBlock = (s) => (s ? md.parse(String(s)) : "")
const mdInline = (s) => (s ? md.parseInline(String(s)) : "")

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const refName = (ref) => ref.split("/").pop()
const refLink = (ref) => {
  const kind = ref.split("/")[2]
  const name = refName(ref)
  if (kind === "schemas") return `<a href="#schema-${slug(name)}"><code>${esc(name)}</code></a>`
  return `<code>${esc(name)}</code>`
}
const deref = (o) => {
  let cur = o
  for (let i = 0; i < 8 && cur && cur.$ref; i++) {
    let x = doc
    for (const seg of cur.$ref.slice(2).split("/")) x = x?.[seg]
    cur = x
  }
  return cur
}

function typeLabel(s) {
  if (!s) return ""
  if (s.$ref) return refLink(s.$ref)
  if (s.allOf) return s.allOf.map(typeLabel).join(" + ")
  if (s.oneOf || s.anyOf) return (s.oneOf || s.anyOf).map(typeLabel).join(" | ")
  let t = Array.isArray(s.type) ? s.type.join(" | ") : s.type || (s.properties ? "object" : "")
  if (t === "array" || (Array.isArray(s.type) && s.type.includes("array"))) t = `array of ${typeLabel(s.items) || "any"}`
  let out = `<code>${esc(t)}</code>`
  if (s.format) out += ` <span class="uapi-muted">(${esc(s.format)})</span>`
  return out
}

function constraints(s) {
  if (!s || s.$ref) return ""
  const bits = []
  if (s.const !== undefined) bits.push(`always <code>${esc(JSON.stringify(s.const))}</code>`)
  if (s.enum) bits.push(`one of ${s.enum.map((v) => `<code>${esc(String(v))}</code>`).join(", ")}`)
  if (s.pattern) bits.push(`pattern <code>${esc(s.pattern)}</code>`)
  if (s.minLength !== undefined || s.maxLength !== undefined) bits.push(`length ${s.minLength ?? 0} to ${s.maxLength ?? "any"}`)
  if (s.minimum !== undefined || s.maximum !== undefined) bits.push(`range ${s.minimum ?? "any"} to ${s.maximum ?? "any"}`)
  if (s.default !== undefined) bits.push(`default <code>${esc(JSON.stringify(s.default))}</code>`)
  return bits.length ? `<span class="uapi-muted">(${bits.join("; ")})</span>` : ""
}

const statusBadge = (st) =>
  st === "planned" ? `<span class="uapi-badge uapi-planned">Planned</span>` : st === "live" ? `<span class="uapi-badge uapi-live">Live</span>` : ""

function propsTable(schema) {
  const s = deref(schema)
  if (!s) return ""
  if (s.allOf) return s.allOf.map((p) => (p.$ref ? `<p>Includes every field of ${refLink(p.$ref)}.</p>` : propsTable(p))).join("")
  if (!s.properties) {
    const c = constraints(s)
    return `<p>${typeLabel(schema)}${c ? ` ${c}` : ""}</p>${s.description && !schema.$ref ? `<div class="uapi-desc">${mdBlock(s.description)}</div>` : ""}`
  }
  const req = new Set(s.required ?? [])
  const rows = Object.entries(s.properties)
    .map(([name, p]) => {
      const desc = [p.description ? mdInline(p.description) : "", constraints(p)].filter(Boolean).join(" ")
      return `<tr><td><code>${esc(name)}</code>${req.has(name) ? ` <span class="uapi-req">required</span>` : ""}${p["x-status"] ? ` ${statusBadge(p["x-status"])}` : ""}</td><td>${typeLabel(p)}</td><td>${desc}</td></tr>`
    })
    .join("")
  return `<div class="uapi-scroll"><table class="uapi-table"><thead><tr><th>Field</th><th>Type</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function paramsTable(params) {
  if (!params.length) return ""
  const rows = params
    .map((raw) => {
      const p = deref(raw)
      const s = p.schema ?? {}
      const desc = [p.description ? mdInline(p.description) : "", constraints(s.$ref ? null : s)].filter(Boolean).join(" ")
      return `<tr><td><code>${esc(p.name)}</code>${p.required ? ` <span class="uapi-req">required</span>` : ""}${p["x-status"] ? ` ${statusBadge(p["x-status"])}` : ""}</td><td>${esc(p.in)}</td><td>${typeLabel(s)}</td><td>${desc}</td></tr>`
    })
    .join("")
  return `<h5>Parameters</h5><div class="uapi-scroll"><table class="uapi-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function bodyBlock(rb) {
  if (!rb) return ""
  const b = deref(rb)
  const parts = Object.entries(b.content ?? {})
    .map(([ct, c]) => `<p class="uapi-ct"><code>${esc(ct)}</code></p>${propsTable(c.schema)}`)
    .join("")
  return `<h5>Request body${b.required ? ` <span class="uapi-req">required</span>` : ""}</h5>${b.description ? `<div class="uapi-desc">${mdBlock(b.description)}</div>` : ""}${parts}`
}

function responsesBlock(responses) {
  const rows = Object.entries(responses ?? {})
    .map(([code, raw]) => {
      const r = deref(raw)
      const schemas = Object.values(r.content ?? {})
        .map((c) => typeLabel(c.schema))
        .filter(Boolean)
      const headers = Object.keys(r.headers ?? {})
      return `<tr><td><code>${esc(code)}</code></td><td>${mdInline(r.description ?? "")}${headers.length ? `<br><span class="uapi-muted">Headers: ${headers.map((h) => `<code>${esc(h)}</code>`).join(", ")}</span>` : ""}</td><td>${schemas.join(", ")}</td></tr>`
    })
    .join("")
  return `<h5>Responses</h5><div class="uapi-scroll"><table class="uapi-table"><thead><tr><th>Status</th><th>Meaning</th><th>Body</th></tr></thead><tbody>${rows}</tbody></table></div>`
}

function scopesNote(op) {
  const sec = op.security ?? doc.security ?? []
  if (Array.isArray(sec) && sec.length === 0) return `<p class="uapi-muted">No Bearer token: this call authenticates with your client credentials.</p>`
  return `<p class="uapi-muted">Needs <code>Authorization: Bearer &lt;access_token&gt;</code>.</p>`
}

function opBlock({ path: p, method, op, pathItem }) {
  const params = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])]
  return `<article class="uapi-op" id="op-${slug(op.operationId)}">
<h4><span class="uapi-method uapi-m-${method}">${method.toUpperCase()}</span> <code class="uapi-path">${esc(p)}</code> ${statusBadge(op["x-status"])}</h4>
<p class="uapi-summary">${mdInline(op.summary ?? "")}</p>
${op.description ? `<div class="uapi-desc">${mdBlock(op.description)}</div>` : ""}
${scopesNote(op)}
${paramsTable(params)}
${bodyBlock(op.requestBody)}
${responsesBlock(op.responses)}
</article>`
}

const ops = operations(doc)
const tags = [...(doc.tags ?? [])].sort((a, b) => {
  const ia = TOPICS.indexOf(a.name)
  const ib = TOPICS.indexOf(b.name)
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
})

const sections = tags
  .map((t) => {
    const tops = ops.filter((o) => o.op.tags?.[0] === t.name)
    if (!tops.length) return ""
    return `<section class="uapi-tag" id="tag-${slug(t.name)}"><h3>${esc(t.name)}</h3>${t.description ? `<div class="uapi-desc">${mdBlock(t.description)}</div>` : ""}${tops.map(opBlock).join("\n")}</section>`
  })
  .join("\n")

const schemaSection = `<section class="uapi-tag" id="schemas"><h3>Schemas</h3>${Object.entries(doc.components?.schemas ?? {})
  .map(
    ([name, s]) =>
      `<article class="uapi-schema" id="schema-${slug(name)}"><h4><code>${esc(name)}</code>${s["x-status"] ? ` ${statusBadge(s["x-status"])}` : ""}</h4>${s.description && s.properties ? `<div class="uapi-desc">${mdBlock(s.description)}</div>` : ""}${propsTable(s)}</article>`,
  )
  .join("\n")}</section>`

const nav = `<nav class="uapi-nav" aria-label="API reference"><ul>
<li><a href="#overview">Overview</a></li>
${tags
  .map((t) => {
    const tops = ops.filter((o) => o.op.tags?.[0] === t.name)
    if (!tops.length) return ""
    return `<li><a href="#tag-${slug(t.name)}">${esc(t.name)}</a><ul>${tops
      .map((o) => `<li><a href="#op-${slug(o.op.operationId)}"><span class="uapi-method uapi-m-${o.method}">${o.method.toUpperCase()}</span> ${mdInline(o.op.summary)}${o.op["x-status"] === "planned" ? " <span class=\"uapi-muted\">(planned)</span>" : ""}</a></li>`)
      .join("")}</ul></li>`
  })
  .join("\n")}
<li><a href="#schemas">Schemas</a></li>
</ul></nav>`

const live = ops.filter((o) => o.op["x-status"] === "live").length
const planned = ops.length - live
const server = doc.servers?.[0]?.url ?? ""

function fragment({ downloads }) {
  return `<div class="uapi" data-untrace-api-version="${esc(doc.info.version)}">
<style>${CSS}</style>
<header class="uapi-head" id="overview">
<h2>${esc(doc.info.title)} <span class="uapi-muted">v${esc(doc.info.version)}</span></h2>
<p class="uapi-summary">${mdInline(doc.info.summary ?? "")}</p>
<p>Base URL <code>${esc(server)}</code>. ${planned ? `${live} live operations, ${planned} planned. ${statusBadge("live")} works today. ${statusBadge("planned")} is part of the contract but answers 404 until it ships.` : `All ${live} operations are ${statusBadge("live")}.`}</p>
${downloads ? `<p>Machine-readable contract: <a href="openapi.yaml">openapi.yaml</a> and <a href="openapi.json">openapi.json</a>.</p>` : ""}
</header>
<div class="uapi-grid">
${nav}
<main class="uapi-main">
<section class="uapi-intro">${mdBlock(doc.info.description)}</section>
${sections}
${schemaSection}
<footer class="uapi-foot"><p>Licensed under ${esc(doc.info.license?.name ?? "")}. Generated from the Untrace Drive contract at commit <code>${esc(source.commit.slice(0, 12))}</code>.</p></footer>
</main>
</div>
</div>`
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="description" content="${esc(doc.info.summary ?? "")}">
<title>${esc(doc.info.title)} reference</title>
<style>html,body{margin:0;background:#f6f6f2;color:#16181a}body{padding:24px}</style>
</head>
<body>
${fragment({ downloads: true })}
</body>
</html>
`

rmSync(DIST, { recursive: true, force: true })
mkdirSync(path.join(DIST, "embed"), { recursive: true })
writeFileSync(path.join(DIST, "index.html"), page)
writeFileSync(path.join(DIST, "openapi.yaml"), text)
writeFileSync(path.join(DIST, "openapi.json"), JSON.stringify(doc, null, 2) + "\n")
const frag = fragment({ downloads: false }) + "\n"
writeFileSync(path.join(DIST, "embed", "reference.html"), frag)
writeFileSync(
  path.join(DIST, "embed", "reference.mjs"),
  `// Generated by untrace-api scripts/build.mjs from Drive ${source.commit}. Do not edit.\nexport const version = ${JSON.stringify(doc.info.version)}\nexport const sourceCommit = ${JSON.stringify(source.commit)}\nexport const html = ${JSON.stringify(frag)}\n`,
)
console.log(`build: ${ops.length} operations (${live} live, ${planned} planned) -> dist/index.html, dist/embed/`)
