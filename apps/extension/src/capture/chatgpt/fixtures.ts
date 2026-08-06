/** HTML fixtures for ChatGPT adapter tests (no live ChatGPT). */

export const FIXTURE_COMPLETED_FOUR_TURNS = `
<main>
  <div data-message-author-role="user" data-message-id="msg-user-1">
    <div class="whitespace-pre-wrap">Hello unique phrase alpha</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="msg-asst-1">
    <div class="markdown"><p>Reply unique phrase beta</p></div>
  </div>
  <div data-message-author-role="user" data-message-id="msg-user-2">
    <div class="whitespace-pre-wrap">Follow-up unique phrase gamma</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="msg-asst-2">
    <div class="markdown"><p>Second reply unique phrase delta</p></div>
  </div>
</main>
`;

export const FIXTURE_STREAMING_ASSISTANT = `
<main>
  <div data-message-author-role="user" data-message-id="msg-user-1">
    <div class="whitespace-pre-wrap">Prompt while streaming</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="msg-asst-stream" data-is-streaming="true" class="result-streaming">
    <div class="markdown"><p>Partial answer</p></div>
  </div>
  <button data-testid="stop-button" aria-label="Stop generating">Stop</button>
</main>
`;

export const FIXTURE_FALLBACK_NO_IDS = `
<main>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
  <div data-message-author-role="assistant">
    <div class="markdown"><p>Answer one</p></div>
  </div>
  <div data-message-author-role="user">
    <div class="whitespace-pre-wrap">Same text twice</div>
  </div>
  <div data-message-author-role="assistant">
    <div class="markdown"><p>Answer two</p></div>
  </div>
</main>
`;

export const FIXTURE_ARTICLE_FALLBACK = `
<main>
  <article data-testid="conversation-turn-1">
    <div data-message-author-role="user" data-message-id="art-u1">
      <div class="whitespace-pre-wrap">Article user</div>
    </div>
  </article>
  <article data-testid="conversation-turn-2">
    <div data-message-author-role="assistant" data-message-id="art-a1">
      <div class="markdown"><p>Article assistant</p></div>
    </div>
  </article>
</main>
`;

export const FIXTURE_TOOL_CARD_SKIPPED = `
<main>
  <div data-message-author-role="user" data-message-id="msg-u">
    <div class="whitespace-pre-wrap">Ask for a tool</div>
  </div>
  <div data-message-author-role="tool" data-message-id="msg-tool">
    <div class="whitespace-pre-wrap">tool output should be ignored</div>
  </div>
  <div data-message-author-role="assistant" data-message-id="msg-a">
    <div class="markdown"><p>Final assistant text</p></div>
  </div>
</main>
`;

/**
 * Live shape: user role node holds caption/empty text; uploaded image is a
 * sibling under the conversation-turn article. Preview uses blob:; durable
 * URL is on the wrapping estuary <a href>.
 */
export const FIXTURE_USER_UPLOAD_IMAGE_SIBLING = `
<main>
  <article data-testid="conversation-turn-uploaded">
    <div data-message-author-role="user" data-message-id="msg-img-user">
      <div class="whitespace-pre-wrap"></div>
    </div>
    <div class="attachment">
      <a href="https://chatgpt.com/backend-api/estuary/content?id=file_upload_live&ts=1&p=2&cid=3&sig=4&v=5">
        <img src="blob:https://chatgpt.com/preview-uuid" alt="uploaded" />
      </a>
    </div>
  </article>
</main>
`;

/** Estuary on img src directly inside turn, role node has caption text. */
export const FIXTURE_USER_UPLOAD_IMAGE_ESTUARY_SRC = `
<main>
  <article data-testid="conversation-turn-estuary-src">
    <div data-message-author-role="user" data-message-id="msg-img-user-2">
      <div class="whitespace-pre-wrap">see attached</div>
    </div>
    <div>
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_direct&ts=1&p=2&cid=3&sig=4&v=5" alt="x" />
    </div>
  </article>
</main>
`;

/**
 * Live shape (Mar 2026+): estuary img[src] inside the user role node.
 * Display URL may carry only `id` (signed query params optional).
 */
export const FIXTURE_USER_UPLOAD_ESTUARY_IN_ROLE_MIN_QUERY = `
<main>
  <article data-testid="conversation-turn-live-min">
    <div data-message-author-role="user" data-message-id="msg-live-upload">
      <div class="whitespace-pre-wrap"></div>
      <div>
        <img
          alt="uploaded image"
          src="https://chatgpt.com/backend-api/estuary/content?id=file_live_min_only"
        />
      </div>
    </div>
  </article>
</main>
`;

/**
 * Observed live shape (Aug 2026): turn is `section[data-turn]` without a
 * conversation-turn testid. User role holds empty caption; preview is blob:;
 * durable estuary URL is on a sibling anchor (not wrapping the img).
 * Without `section[data-turn]` / `[data-turn]` in imageSearchRoot, discovery
 * falls back to the role node and never sees the sibling attachment.
 */
export const FIXTURE_USER_UPLOAD_SECTION_DATA_TURN_SIBLING = `
<main>
  <section data-turn="user">
    <div data-message-author-role="user" data-message-id="msg-section-turn-upload">
      <div class="whitespace-pre-wrap"></div>
    </div>
    <div class="relative">
      <img src="blob:https://chatgpt.com/live-preview-uuid" alt="uploaded image" />
      <a
        href="https://chatgpt.com/backend-api/estuary/content?id=file_section_turn&ts=1&p=2&cid=3&sig=4&v=5"
        aria-label="Download"
      >Download</a>
    </div>
  </section>
</main>
`;

/** Assistant image-only: empty markdown, estuary sibling under turn root. */
export const FIXTURE_ASSISTANT_IMAGE_ONLY = `
<main>
  <article data-testid="conversation-turn-asst-img">
    <div data-message-author-role="assistant" data-message-id="msg-asst-img-only">
      <div class="markdown"></div>
    </div>
    <div class="attachment">
      <a href="https://chatgpt.com/backend-api/estuary/content?id=file_asst_only&ts=1&p=2&cid=3&sig=4&v=5">
        <img src="blob:https://chatgpt.com/asst-preview" alt="generated" />
      </a>
    </div>
  </article>
</main>
`;

/** Assistant caption text + generated estuary image sibling. */
export const FIXTURE_ASSISTANT_TEXT_AND_IMAGE = `
<main>
  <article data-testid="conversation-turn-asst-text-img">
    <div data-message-author-role="assistant" data-message-id="msg-asst-text-img">
      <div class="markdown"><p>Here is your duck</p></div>
    </div>
    <div class="attachment">
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_asst_captioned&ts=1&p=2&cid=3&sig=4&v=5" alt="generated" />
    </div>
  </article>
</main>
`;

/** Streaming assistant with image must not complete. */
export const FIXTURE_ASSISTANT_IMAGE_STREAMING = `
<main>
  <article data-testid="conversation-turn-asst-stream-img">
    <div
      data-message-author-role="assistant"
      data-message-id="msg-asst-stream-img"
      data-is-streaming="true"
    >
      <div class="markdown"></div>
      <div class="result-streaming"></div>
    </div>
    <div class="attachment">
      <a href="https://chatgpt.com/backend-api/estuary/content?id=file_asst_stream&ts=1&p=2&cid=3&sig=4&v=5">
        <img src="blob:https://chatgpt.com/asst-stream" alt="generated" />
      </a>
    </div>
  </article>
</main>
`;

/**
 * Live mismatch: section[data-turn=assistant] hosts the generated image with
 * no nested data-message-author-role="assistant".
 */
export const FIXTURE_ASSISTANT_DATA_TURN_IMAGE_NO_ROLE = `
<main>
  <section data-turn="assistant" data-testid="conversation-turn-gen-1">
    <div data-conversation-screenshot-content>
      <a href="https://chatgpt.com/backend-api/estuary/content?id=file_data_turn_norole&ts=1&p=2&cid=3&sig=4&v=5">
        <img src="blob:https://chatgpt.com/gen-norole" alt="generated" />
      </a>
    </div>
  </section>
</main>
`;

/** data-turn=assistant with caption author-role + sibling image. */
export const FIXTURE_ASSISTANT_DATA_TURN_CAPTION_IMAGE = `
<main>
  <section data-turn="assistant" data-testid="conversation-turn-gen-2">
    <div data-message-author-role="assistant" data-message-id="msg-data-turn-cap">
      <div class="markdown"><p>Here is your duck</p></div>
    </div>
    <div class="attachment">
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_data_turn_cap&ts=1&p=2&cid=3&sig=4&v=5" alt="generated" />
    </div>
  </section>
</main>
`;

/**
 * Standalone screenshot-content image host (no enclosing data-turn).
 * Must become an assistant candidate without promoting tool text cards.
 */
export const FIXTURE_ASSISTANT_SCREENSHOT_CONTENT_ONLY = `
<main>
  <div data-conversation-screenshot-content>
    <img src="https://chatgpt.com/backend-api/estuary/content?id=file_screenshot_only&ts=1&p=2&cid=3&sig=4&v=5" alt="generated" />
  </div>
</main>
`;

/** Tool text card must remain excluded (no image). */
export const FIXTURE_TOOL_ONLY_TEXT = `
<main>
  <div data-message-author-role="user" data-message-id="msg-tool-user">
    <div class="whitespace-pre-wrap">use a tool</div>
  </div>
  <div data-message-author-role="tool" data-message-id="msg-tool-only">
    <div class="whitespace-pre-wrap">tool output text only</div>
  </div>
</main>
`;

/** Streaming data-turn assistant image must not complete early. */
export const FIXTURE_ASSISTANT_DATA_TURN_IMAGE_STREAMING = `
<main>
  <section data-turn="assistant" data-testid="conversation-turn-gen-stream" data-is-streaming="true">
    <div class="result-streaming"></div>
    <div data-conversation-screenshot-content>
      <img src="https://chatgpt.com/backend-api/estuary/content?id=file_data_turn_stream&ts=1&p=2&cid=3&sig=4&v=5" alt="generated" />
    </div>
  </section>
</main>
`;
