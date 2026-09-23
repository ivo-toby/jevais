# Review: jevais-fix-lintignore

- Task: `jevais-fix-lintignore` (eslint global ignores for nested build output)
- Worker run: `worker-2026-09-23T00-04-13-186Z-ff8354a7` (titan, thinking
  high), 0.5 min, 1 tool call, 0 scope violations, outcome completed.
- Reviewer: controller (pi session 2026-09-22/23), on behalf of operator Ivo.
- Verdict: **accepted**.

## What changed

`eslint.config.js` line 7:

- before: `ignores: ['dist/', 'node_modules/', 'coverage/'],`
- after: `ignores: ['**/dist/', 'node_modules/', 'coverage/', '.tinysdd/'],`

## Why

ESLint flat-config global ignores with a bare `dist/` pattern match only the
project-root directory. TinySDD run workspaces (`.tinysdd/runs/*/workspace-*/
dist/`) contain built JS, so a local `npm run lint` reported 56 `no-undef`
errors from non-library files. `**/dist/` covers root and nested dist;
`.tinysdd/` excludes tooling state entirely. CI is unaffected (fresh
checkout, `.tinysdd/` never committed); local verification is green again.

## Verification

- Candidate diff is exactly the one recipe line (byte-identical to target).
- Controller re-ran `npm run lint` on the full local tree **with `.tinysdd`
  present**: clean, exit 0.
- No other file changed (single-file allowlist, scope-clean run).
