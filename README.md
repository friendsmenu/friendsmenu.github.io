# FRIENDS Restaurant — QR Menu

Live: **https://friendsmenu.github.io/**
Dashboard: **https://friendsmenu.github.io/admin.html**

Fast-food restaurant, Beni Suef. Static site on GitHub Pages.

```
index.html            the menu (renders from data/menu.json)
admin.html             dashboard
assets/admin.css|js    dashboard code
data/menu.json         the menu content — single source of truth
assets/*.jpg           section photos
```

## Editing the menu

Open `admin.html`, edit, and press **حفظ دائم**. Edits are kept in the browser
as a draft until published, so closing the tab never loses work. Publishing
writes `data/menu.json` to this repo; GitHub Pages redeploys in about a minute.

The menu is three levels deep: **sections** (الكريب، البيتزا، …) → **categories**
(كريب لحوم، كريب فراخ، …) → **items**. An item has either a single price or
three sizes (S/M/L, for pizza-style pricing) — toggle this per item in the
drawer. Section photos are read from the path set in the section editor
(convention: `assets/<section-id>.jpg`).

## Security model

GitHub Pages is a static host — **anything shipped in this repo is public**.
So the dashboard stores no credential of its own:

- **The token is supplied at runtime by the operator** and kept only in that
  browser (`localStorage`, or `sessionStorage` if "remember" is unchecked).
  It is sent only to `api.github.com` over HTTPS. It never enters the repo.
- **Scope it narrowly**: a fine-grained token on `friendsmenu/friendsmenu.github.io`
  only, with `Contents: Read and write` and nothing else. Give it an expiry.
- The token *is* the authentication. Anyone holding it can publish — treat it
  like a password, don't open the dashboard on a shared machine, and use
  **نسيان التوكن** when done. Revoke at
  <https://github.com/settings/personal-access-tokens>.
- A token that fails auth is purged from the browser automatically.

Deliberately avoided: embedding a token in the page (obfuscated or not) and
client-side password gates. Both are readable by anyone who opens devtools, and
a leaked write-token on this repo would let a stranger inject content into the
live site.

Other hardening:

- **Output escaping** — every value from `menu.json` is HTML-escaped before it
  reaches the DOM on the public menu page, and the facebook link / phone
  numbers are scheme/format-sanitized, so tampered data renders as inert text
  instead of executing or opening a `javascript:` URL.
- **CSP** on the dashboard: no inline scripts, `connect-src` limited to
  `api.github.com`, `object-src 'none'`, `frame-ancestors 'none'`.
- **Concurrency guard** — publishing sends the file's `sha`, and warns if the
  published menu changed since the page was opened, so two editors can't
  silently overwrite each other.
- **Validation** before publish: ids are `[a-z0-9_-]` and unique, section/
  category titles required, item name required, price must be > 0 (or at
  least one size > 0).
- `admin.html` is `noindex,nofollow` and unlinked from the public menu.

## Notes

- The public menu caches the last good `menu.json` in `localStorage`, so a
  network hiccup still shows the last good menu rather than a blank page.
- `?preview=1` makes the menu render the unpublished draft — used by the
  dashboard's preview pane.
- Local dev: `python -m http.server` from this folder (the pages use `fetch`,
  so opening `index.html` via `file://` will not work).
