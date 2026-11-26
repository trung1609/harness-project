# Phase 7 — Harness Improvement Report

**Date:** 2026-11-26  
**Scope:** Smallest enforceable Harness and secret-scanning improvements derived from real issues observed during Phases 4–6.

## 1. Observed failures and root causes

1. **Unverified evidence paths & missing project rules in `harness/checks/check.py`:**
   - *Observed:* `validate_state()` checked only that `state.json` `evidence` contained nonempty strings, not whether referenced files existed on disk. `REQUIRED_AGENT_FILES` also omitted `.agents/rules/nestjs-architecture.md`, `.agents/rules/frontend-design.md`, and `.agents/skills/frontend-design/SKILL.md`.
   - *Fix:* Added `validate_evidence_paths(root, state)` to `harness/checks/check.py` (invoked by `context`), added the missing rules and skill to `REQUIRED_AGENT_FILES`, and added passing/failing unit tests in `harness/tests/test_checks.py`.
2. **Gitleaks `dir` scan noise on generated build/dependency folders:**
   - *Observed:* Running `.tools/gitleaks-8.30.1/gitleaks.exe dir --no-banner --redact=100 .` scanned ~211 MB including `.next/` build cache and `node_modules/`, producing 13 false-positive `generic-api-key` hits in `.next/` artifacts.
   - *Fix:* Updated `.gitleaks.toml` allowlist to exclude generated/dependency directories (`node_modules/`, `.next/`, `dist/`, `.tools/`), while keeping `.env*` and all tracked/source files subject to scanning.

## 2. Remaining review-dependent items

- Semantic correctness of documentation, live Vercel/Neon/Upstash/Gmail/Cloudinary provider behavior, and branch protection settings remain dependent on human/CI review and cannot be enforced by local `check.py` alone.
