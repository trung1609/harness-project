---
name: project-implementation
description: Implement a single approved Task Management System task with test-driven development, scope control, and evidence-based verification.
---

# Scoped implementation

Follow .agents/workflows/task.md and .agents/rules/quality-gates.md. Read the approved task and relevant specification before editing; preserve pre-existing changes. For behavior changes, write a meaningful failing test, observe its failure, implement the smallest change, and rerun it when feasible. Explicitly report when test-first or a required gate cannot run.

Use actual failures for debugging; identify cause and limit self-fixes for the same issue to three. Never remove or weaken tests to obtain a pass. Review architecture, security and scope, update documentation and state, and report actual evidence. No unapproved business requirement or phase transition is allowed.
