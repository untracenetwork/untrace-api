# Embedding the reference

Two ways to show the Untrace Drive API reference on another site. Both are
static: no JavaScript runs, nothing is loaded from a third party, nothing is
tracked.

## 1. Inline fragment (recommended, used by untrace.network/docs/api)

`reference.html` is a self-contained HTML fragment. All of its styles are
scoped under the `.uapi` class, and its colours read the host page's design
tokens (`--foreground`, `--muted-foreground`, `--primary`, `--border`,
`--card`, `--muted`), so it picks up the host theme.

`reference.mjs` is the same fragment as an ES module:

```js
import { html, version, sourceCommit } from "./reference.mjs"
```

In a React or Next.js server component:

```tsx
import { html } from "./reference.mjs"

export default function ApiReference() {
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
```

The fragment is generated from `spec/openapi.yaml` by `npm run build`. Every
string from the spec is HTML-escaped and raw HTML in the spec's Markdown is
escaped too, and CI fails if the fragment contains a script, an event
handler, a frame or any remote resource. Vendor it by copying both files and
recording the `sourceCommit`.

## 2. iframe

Host `dist/` (for example on a static site) and frame it:

```html
<iframe
  src="https://<where-dist-is-hosted>/index.html"
  title="Untrace Drive API reference"
  loading="lazy"
  sandbox="allow-same-origin allow-top-navigation-by-user-activation"
  referrerpolicy="no-referrer"
  style="width:100%;height:80vh;border:0"></iframe>
```

The host page needs `frame-src` for that origin in its Content-Security-Policy.
The page itself sends a CSP that allows no scripts and no remote loads.

## Keeping it current

```sh
npm ci
npm run build
cp dist/embed/* embed/
npm run check
```

`check:public` fails when the committed files in this folder differ from a
fresh build.
