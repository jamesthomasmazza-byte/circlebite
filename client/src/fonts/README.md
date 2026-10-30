# Public Sans

The landing page's typeface (`docs/design/landing-mockup.html`), self-hosted: bundled by Vite and
served from our own server, never fetched from Google Fonts or any other host. Used on the
signed-out landing page only; every signed-in page keeps the system font stack (`--font-sans`).

- **Source:** https://github.com/uswds/public-sans, the official repository
- **Version:** release tag `v2.001`, commit `c7923167a592d941646f99fb7b5fba17aa7d69e1`
- **Files:** `fonts/webfonts/` at that commit, unmodified; `OFL.txt` from the repository root
- **Downloaded:** 2026-10-30
- **Licence:** SIL Open Font License 1.1 (`OFL.txt`), which allows bundling with software as long as
  the licence travels with the fonts

| File | Weight | SHA-256 |
|---|---|---|
| `PublicSans-Regular.woff2` | 400 | `f3931c3c3ec5301043634ac8f39bcfa7b30d29181864f2fd0c3e6796feacc471` |
| `PublicSans-Italic.woff2` | 400 italic | `e5cb026df0e1d5ce114260e36b2bb3c78bcd728b4bea00714a59b854151e0ab0` |
| `PublicSans-Medium.woff2` | 500 | `26cedea8665bacddb7c2d9e22327cdfcfc00c517d1b9aef4c3e4dc54d792a1e4` |
| `PublicSans-SemiBold.woff2` | 600 | `f99ffc265cc790e0f058a9f430a465c88996008327abb0f8561cb713add40d73` |
| `PublicSans-Bold.woff2` | 700 | `908322301d5d82f217d2819708c41e097528276b9e7296e0f7388c3a4e320c8c` |
| `PublicSans-ExtraBold.woff2` | 800 | `3a75548c854bae5bcccd2ee4f289ad533aa3370ec1f2c61f47e600fe95999a9c` |
| `OFL.txt` | | `157a9e77f7580246e97c769490e2e977ae94399f9d30f4556015c41fe8c28bac` |

Each `.woff2` begins with the `wOF2` signature and matches the size GitHub lists for it at that
commit. A browser fetches a weight only when the page uses it; the landing page doesn't use 500.
