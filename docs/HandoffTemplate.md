# Implementation Handoff Template

Standard handoff from ChatGPT (architecture / workflow) to Cursor (implementation). Every Cursor task should look approximately like this. See [ArchitectureGovernance.md](./ArchitectureGovernance.md) and [ProjectInstructions.md](./ProjectInstructions.md).

---

```
Implement <subsystem / slice> exactly as specified in docs/<Page>.md.

Requirement: <requirement id or short name>

Scope only:
- <explicit behavior 1>
- <explicit behavior 2>
- <...>

Constraints:
- no architectural changes
- no scope expansion
- <excluded concerns: e.g. no retries, no queue logic, no new dependencies>
- no commit yet

Definition of done:
- the documented test cases in docs/<Page>.md pass
- full test suite passes

Run the full test suite, then report:
- files changed
- requirement implemented
- tests run and results
- known limitations
- any architectural issue discovered

Stop for review before committing.
```

---

Notes:

- **Scope only** and **Constraints** are the load-bearing sections — they bound the task so governance rule 4 (no material redesign) has something concrete to check against.
- If Cursor discovers the task requires an architectural change, it must stop, explain the conflict, propose options, and identify whether an ADR is required (per `.cursor/rules/architecture-governance.mdc`).
- Commit only after review, one logical milestone per commit.
