# Capture Client v1 — Chrome Extension (`@newellai/extension`)

**This package is an adapter, not the product.** NewellAI’s core is the Phase 1 backend; this is the first capture client.

Owns **capture** and the **Durable Queue** for Capture Client v1 only. See [CaptureClient.md](../../docs/CaptureClient.md) and [ADR-0004](../../docs/ADRs/0004-why-browser-extension-capture.md).

Do not implement capture logic until Phase 1 Foundation is complete ([Roadmap](../../docs/Roadmap.md)).

## Status

Scaffold only. No application logic yet.

## Docs

- [CaptureClient.md](../../docs/CaptureClient.md)
- [DurableQueue.md](../../docs/DurableQueue.md)
- [TurnCapture.md](../../docs/TurnCapture.md)
- [Roadmap.md](../../docs/Roadmap.md)

## Develop

```bash
# from repo root
npm install
```

Load `apps/extension` as an unpacked extension after build steps exist (Phase 2).
