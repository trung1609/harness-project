# P2-01 — System boundaries and specification inputs

- **Phase and approval** — Phase 2 approved by the user on 2026-11-26.
- **Objective** — Translate the Phase 1 baseline into a reviewable architecture and identify decisions that affect the specifications.
- **Dependencies and baseline** — Phase 1 complete. Clean worktree at commit `778bab2`.
- **Allowed scope** — `docs/ARCHITECTURE.md`, `docs/specs/data-and-scheduling.md`, `docs/specs/auth-and-support.md`, `docs/specs/api-contract.md`, `docs/specs/openapi.json`, `docs/specs/deployment-and-verification.md`, `docs/plans/phase-2-01.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md` and `harness/policy/state.json`. The user also approved updating the image limit in `docs/REQUIREMENTS.md`.
- **Expected changes** — Architecture draft, logical model, traceability and phase state.
- **Acceptance criteria** — Cover core product boundaries and data ownership, distinguish proposals from requirements, and document deployment constraints with evidence.
- **Verification** — Review against Phase 1, run the context checker, local scope check and `git diff --check`.
- **Definition of done** — Architecture decisions recorded after review. Subsequent Phase 2 specifications cover ERD, database constraints, API, authentication, errors, transactions, logging and test strategy.
- **Status** — COMPLETE. The user approved the Vercel topology, Neon PostgreSQL, scheduling rules, session and activation lifetimes, and Gmail SMTP delivery. Staging and operational settings carry forward, including off-provider PostgreSQL backup and restore verification. Phase 3 requires explicit user approval.
- **Verification** — Context, scope, diff and official OpenAPI schema checks validate this design change. Provider runtime checks are NOT RUN.
