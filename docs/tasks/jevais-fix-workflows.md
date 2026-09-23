# Task brief: jevais v0.1.0 — review fixes (workflows layer)

Operator directive 2026-09-22: "review changes, use the tinySDD worker for
fixes. When no p0, p1, p2 issues remain; commit and push to main." This task
covers the GitHub-workflow layer of the review findings; sibling tasks
`jevais-fix-meta` (config/scripts) and `jevais-review-fixes` (content)
cover the rest.

## Outcome and boundaries

Apply the two workflow findings below to the already-implemented `jevais`
library. Only `.github/workflows/ci.yml` and `.github/workflows/publish.yml`
change. No other files. No new dependencies. Never touch `transcript.md`,
`.tinysdd/`, `docs/`, `profiles/`, `package-lock.json`, `src/`, `tests/`,
README.md, or any root config.

## Efficiency directive (hard requirement)

Your recipes are pre-validated by the controller. Do not re-derive or
re-verify the design decisions in them. Minimize model turns: read both
workflows in one turn, apply both fixes, done. The full task should fit in
roughly 5 turns.

## Findings to fix

### W-1 (P2, blocking): publish.yml publishes without running the checks

`.github/workflows/publish.yml` only builds before `npm publish --provenance`.
A tag pointing at an unverified commit publishes unverified code. Fix: run
the full check set before publishing. Replace the Install/Build steps with:

```yaml
      - name: Install dependencies
        run: npm ci --no-audit --no-fund

      - name: Lint, format check, typecheck, test, build
        run: |
          npm run lint
          npm run format:check
          npm run typecheck
          npm test
          npm run build

      - name: Publish with provenance
        run: npm publish --provenance
```

Keep the existing `permissions` block (`contents: read`, `id-token: write`)
and the existing trigger (`push: tags: ['v*']`) unchanged. The scripts
referenced above (`format:check`, extended `typecheck`) are added by sibling
task `jevais-fix-meta` and will exist in the final tree.

### W-2: ci.yml — npm install instead of npm ci, no permissions block, no
format check

In `.github/workflows/ci.yml`:

1. Change `npm install --no-audit --no-fund` to `npm ci --no-audit --no-fund`
   (`package-lock.json` is committed).
2. Add to the `check` job:

   ```yaml
   permissions:
     contents: read
   ```

3. Add a `Format check` step (`run: npm run format:check`) after the Install
   step (the script is added by sibling task `jevais-fix-meta`).

## Out of scope (do NOT fix)

- No Node version matrix (single Node 20 stays).
- No changes to workflow triggers, names, or other steps beyond W-1/W-2.
- No edits outside the two workflow files.

## Verification

After your edits, YAML validity is the only mechanical check available to you
(`npx yaml-lint` or a `node -e` yaml parse if available in your sandbox;
skip if not). The controller re-verifies the full tree independently in a
disposable copy before applying; your run is a self-check, not the gate.

## Division of labor

Worker: titan (CLI pi, model `litellm/titan/llamacpp/qwen3.8-q4s-256k`,
thinking high, profile `profiles/titan-qwen38.json`) per operator directive.
The worker produces a candidate and patch in its sandbox and never applies
or commits. The controller (this agent) reviews, verifies, applies, records
the review, and handles git.
