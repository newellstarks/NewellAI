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
