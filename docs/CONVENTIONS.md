# Working conventions

Each task plan must define ID, objective, dependencies, allowed scope, expected changes, acceptance criteria, test cases, verification commands and definition of done. Record a baseline and inspect user changes before modifying files. Scope checks are advisory unless a protected CI gate enforces them.

Use test-first development for behavior changes when applicable. Verify actual results, review changes and record evidence. If a step cannot run, record NOT RUN or BLOCKED and the reason. Limit self-fixes to three for a single problem. Avoid duplicate documents; record decisions only when approved.

Distinguish VERIFIED, ASSUMPTION, PROPOSAL and BLOCKED. Never convert a proposal into a requirement without approval. Phase transitions require explicit approval.
