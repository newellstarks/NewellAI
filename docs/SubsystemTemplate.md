# Subsystem notebook template

Use this checklist when adding a new subsystem page under `docs/`. Spend 10–15 minutes here **before** asking Cursor to code.

## Required sections

1. **Purpose** — Why does this exist?
2. **Requirements** — What must it do? (and non-requirements)
3. **Inputs / Outputs** — Interfaces and payload contracts
4. **Failure modes** — What goes wrong and expected behavior
5. **Performance goals** — Latency, throughput, durability targets
6. **Test cases** — How we will know it works
7. **Open questions** — What must be decided (via ADR) before coding

## Then implement

Only after the page is accepted:

> Implement the &lt;Subsystem&gt; exactly as specified in the engineering notebook (`docs/&lt;Page&gt;.md`).

That keeps **architecture driving the code**, not the code driving the architecture.

## Example

See [DurableQueue.md](./DurableQueue.md).
