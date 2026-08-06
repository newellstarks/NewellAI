import type { Env } from "./env";
import { errorResponse, HttpError } from "./errors";
import { createRequestId, withRequestId } from "./requestId";
import { handleHealth } from "./routes/health";
import { handleRecallStatic } from "./routes/recall";
import { handleDevPair } from "./routes/v1/devPair";
import { handleRecallSession } from "./routes/v1/recallSession";
import {
  handleConversationTurns,
  handleListConversations,
} from "./routes/v1/conversations";
import {
  handleCreateArtifact,
  handleGetArtifact,
  handleGetArtifactContent,
  handleListConversationArtifacts,
  handlePutArtifactContent,
} from "./routes/v1/artifacts";
import { handleSearch } from "./routes/v1/search";
import { handleStatus } from "./routes/v1/status";
import { handleIngestTurns } from "./routes/v1/turns";

const CONVERSATION_TURNS_RE = /^\/v1\/conversations\/([^/]+)\/turns$/;
const CONVERSATION_ARTIFACTS_RE =
  /^\/v1\/conversations\/([^/]+)\/artifacts$/;
const ARTIFACT_CONTENT_RE = /^\/v1\/artifacts\/([^/]+)\/content$/;
const ARTIFACT_ONE_RE = /^\/v1\/artifacts\/([^/]+)$/;

/**
 * Worker entry — ingest + authentication + D1 persistence + read slices
 * + local-only POST /v1/dev/pair (Slice 2.1) + Artifact v1 image routes
 * + Desktop Recall search/status + /recall/ UI.
 */
async function routeV1(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const pair = await handleDevPair(request, env, pathname);
  if (pair !== null) return pair;

  const recallSession = await handleRecallSession(request, env, pathname);
  if (recallSession !== null) return recallSession;

  if (pathname === "/v1/turns") {
    return handleIngestTurns(request, env);
  }
  if (pathname === "/v1/conversations") {
    return handleListConversations(request, env);
  }
  if (pathname === "/v1/search") {
    return handleSearch(request, env);
  }
  if (pathname === "/v1/status") {
    return handleStatus(request, env);
  }
  if (pathname === "/v1/artifacts") {
    return handleCreateArtifact(request, env);
  }
  const contentMatch = ARTIFACT_CONTENT_RE.exec(pathname);
  if (contentMatch !== null) {
    const id = decodeURIComponent(contentMatch[1]!);
    if (request.method === "PUT") {
      return handlePutArtifactContent(request, env, id);
    }
    if (request.method === "GET") {
      return handleGetArtifactContent(request, env, id);
    }
    throw new HttpError(
      "METHOD_NOT_ALLOWED",
      "Use GET or PUT for /v1/artifacts/:id/content",
    );
  }
  const artifactMatch = ARTIFACT_ONE_RE.exec(pathname);
  if (artifactMatch !== null) {
    const id = decodeURIComponent(artifactMatch[1]!);
    if (request.method === "GET") {
      return handleGetArtifact(request, env, id);
    }
    throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /v1/artifacts/:id");
  }
  const artifactsListMatch = CONVERSATION_ARTIFACTS_RE.exec(pathname);
  if (artifactsListMatch !== null) {
    return handleListConversationArtifacts(
      request,
      env,
      decodeURIComponent(artifactsListMatch[1]!),
    );
  }
  const turnsMatch = CONVERSATION_TURNS_RE.exec(pathname);
  if (turnsMatch !== null) {
    return handleConversationTurns(
      request,
      env,
      decodeURIComponent(turnsMatch[1]!),
    );
  }
  throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const { pathname } = url;

      if (pathname === "/health") {
        if (request.method !== "GET") {
          throw new HttpError("METHOD_NOT_ALLOWED", "Use GET for /health");
        }
        return handleHealth();
      }

      if (pathname === "/recall" || pathname.startsWith("/recall/")) {
        return handleRecallStatic(request, env, pathname);
      }

      if (pathname.startsWith("/v1/")) {
        const requestId = createRequestId();
        try {
          return withRequestId(await routeV1(request, env, pathname), requestId);
        } catch (error) {
          return withRequestId(errorResponse(error), requestId);
        }
      }

      throw new HttpError("NOT_FOUND", `No route for ${pathname}`);
    } catch (error) {
      return errorResponse(error);
    }
  },
};
