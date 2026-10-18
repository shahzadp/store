# Third-party notices

This repository contains third-party work, licensed by its own authors. The
licence text for the components that are committed here is reproduced below in
full. **The terms in this repository's `LICENSE` do not apply to this material**
- and this material's permissive terms say nothing about the rest of the
repository.

**Why this file is not named like a licence.** GitHub's licence detector treats a
root file whose name looks like one as *the repository's* licence. The app
repository had exactly that fault: a third-party MIT notice sitting at its root
made GitHub report the whole project as MIT, which read as permission to reuse
the app, its name and its icon. A file called `THIRD_PARTY_SQLJS_LICENSE` would do
the same thing here - and worse, because here it would be believed: this
repository really does contain MIT-licensed code, so the badge would look
consistent with the evidence while still being wrong about everything else.

---

## sql.js - MIT

`vendor/sql-wasm.js` and `vendor/sql-wasm.wasm` are committed copies of
sql.js 1.10.3's `dist/` build, unmodified; the SHA-256 of the `.wasm` is recorded
in `db.js`. sql.js is MIT licensed. SQLite itself, which the WebAssembly module is
a compilation of, is in the public domain.

```
MIT license

Copyright (c) 2017 sql.js authors (see AUTHORS)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Not in this repository: ternlight - MIT

The search dialog runs [ternlight](https://github.com/soycaporal/ternlight) (MIT,
(c) Wenshu Tang), but no part of it is committed here. `search.js` loads the
engine from jsDelivr at runtime, from
`https://cdn.jsdelivr.net/npm/@ternlight/base@0.1.1/pkg-web/tern_engine.js`, and
that package carries its own licence. Nothing is redistributed out of this
repository, so nothing is owed here; its notice is reproduced in full in the app
repository, which does compile the same engine to native code:
<https://github.com/shahzadp/alex-store-app/blob/main/THIRD_PARTY_NOTICES.md>.
