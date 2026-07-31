# Chrome Extension (`@newellai/extension`)

Capture surface for ChatGPT turns. Owns **capture** and the **Durable Queue** (buffer, order, retry, sync).

The Worker is only authenticated ingest, validation, and D1 persistence — see [ADR-0002](../../docs/ADRs/0002-durable-queue-in-extension.md).

## Status

Scaffold only. No application logic yet.

## Docs

- [ChromeExtension.md](../../docs/ChromeExtension.md)
- [DurableQueue.md](../../docs/DurableQueue.md)
- [TurnCapture.md](../../docs/TurnCapture.md)

## Develop

```bash
# from repo root
npm install
```

Load `apps/extension` as an unpacked extension after build steps exist.
