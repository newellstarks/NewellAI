# Architecture Governance

**Chapter 13 — Architecture Governance**

| | |
|---|---|
| **Status** | Stable |
| **Purpose** | How architecture, implementation, review, and redesign decisions are made for NewellAI. |
| **Prerequisites** | [Chapter 0 — Engineering Notebook](./README.md), [Chapter 4 — Architecture](./Architecture.md) |
| **Related chapters** | [SubsystemTemplate](./SubsystemTemplate.md), [ADRs](./ADRs/), [Roadmap](./Roadmap.md) |
| **Nav** | [← Prev](./SubsystemTemplate.md) · [TOC](./README.md#table-of-contents) · [Next →](./ADRs/README.md) |

---

## Purpose

This document defines how architecture, implementation, review, and redesign decisions are made for NewellAI.

## Roles

### System Owner

Newell is the final decision-maker for requirements, priorities, architecture, cost, scope, and deployment.

### Architecture Advisor

ChatGPT is used to develop and maintain:

- system architecture
- requirements
- interfaces
- data models
- security principles
- architectural decisions

### Implementation Agent

Cursor is used to:

- implement approved requirements
- modify repository files
- run tests
- diagnose implementation errors
- recommend localized improvements

Cursor must not materially redesign the system without explicit approval.

### Independent Reviewer

A second model, such as Claude, may be used at defined review gates to:

- identify missing risks
- challenge assumptions
- detect security or reliability concerns
- suggest simpler alternatives

The reviewer provides advice. It does not control the architecture.

## Architecture Review Rule

One independent architecture review is normally permitted before implementation begins.

A second architecture review requires at least one of the following:

- material scope change
- newly discovered technical constraint
- security or data-integrity concern
- failed implementation evidence
- unacceptable performance or reliability test result

A request for another review without new evidence should be challenged before proceeding.

## Architecture Lock

Architecture is considered locked when:

- requirements are sufficiently defined
- major components and interfaces are identified
- important risks are documented
- the owner has approved the direction
- implementation can begin without unresolved foundational decisions

Architecture lock does not mean the design can never change. It means changes require evidence and documentation.

## Implementation Rule

After architecture lock:

1. Implement the smallest useful vertical slice.
2. Run automated tests.
3. Compare implementation against requirements.
4. Record defects and deviations.
5. Change architecture only when implementation evidence justifies it.

## Change Control

A material architectural change requires an Architecture Decision Record.

Material changes include:

- changing major components
- changing persistence technology
- changing authentication architecture
- changing data ownership or security boundaries
- changing public API contracts
- introducing a new infrastructure dependency

## Operating Cycle

```
ChatGPT Architect
    ↓
Architecture and requirements
    ↓
One independent Claude review, when warranted
    ↓
Newell accepts/rejects findings
    ↓
Architecture lock + ADR
    ↓
Bounded Cursor task
    ↓
Code + automated tests
    ↓
Evidence
    ↓
Architecture revisited only if evidence demands it
```

## Review Priorities

Reviews should prioritize:

1. correctness
2. security
3. data integrity
4. reliability
5. maintainability
6. simplicity
7. performance

Optimization without demonstrated need is discouraged.

## Enforcement

This chapter is authoritative. Each role's operating instructions derive from it:

| Role | Instruction location |
|------|---------------------|
| Implementation Agent (Cursor) | `.cursor/rules/architecture-governance.mdc` — always-applied checklist directing the agent here before changes |
| Architecture Advisor (GPT-5 Architect) | [AdvisorInstructions.md](./AdvisorInstructions.md) — canonical copy of the GPT's custom instructions, including the anti-iteration review gate |
| Workflow context (ChatGPT Project) | [ProjectInstructions.md](./ProjectInstructions.md) — canonical copy of the AI / SYSTEMS ARCHITECTURE Project instructions |
| Implementation handoffs | [HandoffTemplate.md](./HandoffTemplate.md) — standard bounded-task format from ChatGPT to Cursor |

Update instructions here first, then propagate to the tool.
