# Shared contracts (`@newellai/contracts`)

**Wire protocol** between every capture client and the Cloudflare Worker backend.

Spec: [docs/Contracts.md](../../docs/Contracts.md)

## Exports

- `Speaker`
- `TurnPayload`
- `ConversationMetadata`
- `CaptureMetadata`
- `UploadRequest`
- `UploadResponse`
- `ConversationSummary`
- `ConversationsResponse`
- `TurnRecord`
- `ConversationTurnsResponse`
- `ApiError`

```ts
import type { UploadRequest } from "@newellai/contracts";
```

## Develop

```bash
# from repo root
npm install
npm test -w @newellai/contracts
```
