# ADR-0003: npm workspaces only

## Status

Accepted

## Context

The monorepo needs a single package manager for `apps/*` and `packages/*`. Mixing npm and pnpm (or switching later) creates lockfile and CI surprises.

## Decision

- Use **npm workspaces** consistently throughout the project
- Do **not** introduce pnpm (or yarn)
- One package manager means fewer surprises

## Consequences

- Root `package.json` declares `workspaces`
- Commit `package-lock.json` when dependencies are installed
- Document scripts and install steps with `npm` only
