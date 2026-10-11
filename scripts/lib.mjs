// Shared helpers: load the spec, resolve local $refs, list operations.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"
import yaml from "js-yaml"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const SPEC_PATH = path.join(ROOT, "spec", "openapi.yaml")
export const SOURCE_PATH = path.join(ROOT, "spec", "SOURCE.json")
export const METHODS = ["get", "post", "put", "patch", "delete"]

/** The topics the reference must cover, in reading order (tag names). */
export const TOPICS = ["Auth", "Files", "Content", "Folders", "Keys", "Sharing", "Owner"]

export function loadSpecText() {
  return readFileSync(SPEC_PATH, "utf8")
}

export function loadSpec(text = loadSpecText()) {
  return yaml.load(text)
}

export function loadSource() {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8"))
}

/** Resolve a local JSON pointer such as "#/components/schemas/File". */
export function resolveRef(doc, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return undefined
  let cur = doc
  for (const raw of ref.slice(2).split("/")) {
    const seg = raw.replace(/~1/g, "/").replace(/~0/g, "~")
    if (cur === null || typeof cur !== "object" || !(seg in cur)) return undefined
    cur = cur[seg]
  }
  return cur
}

/** Every "$ref" value anywhere in the document. */
export function collectRefs(doc) {
  const refs = new Set()
  ;(function walk(o) {
    if (Array.isArray(o)) o.forEach(walk)
    else if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o)) {
        if (k === "$ref") refs.add(v)
        else walk(v)
      }
    }
  })(doc)
  return refs
}

/** Flat list of operations: { path, method, op, pathItem }. */
export function operations(doc) {
  const out = []
  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    for (const m of METHODS) if (item[m]) out.push({ path: p, method: m, op: item[m], pathItem: item })
  }
  return out
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
