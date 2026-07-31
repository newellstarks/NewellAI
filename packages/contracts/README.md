# Shared contracts (`@newellai/contracts`)

Client-agnostic TypeScript vocabulary for **all** capture clients and the Cloudflare Worker.

Spec: [docs/Contracts.md](../../docs/Contracts.md)

## Exports

- `TurnPayload`
- `ConversationMetadata`
- `CaptureMetadata`
- `UploadRequest`
- `UploadResponse`
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
