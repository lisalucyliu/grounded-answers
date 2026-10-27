import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

// Current Claude Sonnet model, checked against the Claude API models overview.
const MODEL = 'claude-sonnet-5-5';

const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));

const SYSTEM_PROMPT = `You answer questions about AWS using only the documentation search results provided with the question.
Answer in plain prose paragraphs. Do not use Markdown headings, bold, bullet characters, or tables.
When the answer lists options or steps, write them as a numbered list, one item per line. Start each item with the item's short name and a colon, for example "3. DSSE-KMS: dual-layer server-side encryption with AWS KMS keys". Everything else stays prose.
Use a numbered list for every list. Never start a line with a dash or a bullet.
When the app shows an opening that names a list item, continue it as one sentence: start in lowercase, for example "The third one, DSSE-KMS: it applies...". Proper nouns and acronyms keep their case.
Keep the answer short and practical, the way a senior engineer would explain it to a colleague.
If the search results don't contain the answer, say that the documentation provided doesn't cover it.`;

const MAX_HISTORY_TURNS = 20;
const MAX_TEXT_LENGTH = 20_000;
const isText = (value) => typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;

// The conversation as Claude messages. The doc sections go once, in the first user message.
// Each earlier turn is the reader's question and the response text they saw.
function buildMessages(history, question, resolved) {
  const turns = [...history, { question }];
  const messages = [];
  turns.forEach((turn, index) => {
    const content = [{ type: 'text', text: turn.question }];
    if (index === 0) content.unshift(...searchResults());
    messages.push({ role: 'user', content });
    if (index < turns.length - 1) messages.push({ role: 'assistant', content: [{ type: 'text', text: turn.answer }] });
  });
  // GA-5: the app resolved which list item the reader means, and already shows the opening that names it.
  if (resolved) {
    messages.at(-1).content.push({
      type: 'text',
      text: `The reader means item ${resolved.position} of the numbered list in your last response: ${resolved.name}. The app already shows "${resolved.opening.trim()}" at the start of your answer. Continue right after it, about ${resolved.name} only. Don't repeat which item it is.`,
    });
  }
  return messages;
}

// "page title · guide name › section". The section part only shows when it differs from the page title.
function sourceTitle(section) {
  const base = `${section.pageTitle} · ${section.guideName}`;
  return section.sectionHeading === section.pageTitle ? base : `${base} › ${section.sectionHeading}`;
}

// Prompt caching: one breakpoint on the last doc section, so the stable prefix (system prompt and all
// 25 sections) is cached and every question in a chat reads it. The marker doesn't change what Claude
// receives. Everything after it (the question, the history) is the per-request part.
// One search_result block per doc section, one text block per paragraph,
// so citations can point at the paragraph that supports each claim.
function searchResults() {
  return docs.sections.map((section, index) => ({
    type: 'search_result',
    source: section.url,
    title: sourceTitle(section),
    content: section.paragraphs.map((text) => ({ type: 'text', text })),
    citations: { enabled: true },
    ...(index === docs.sections.length - 1 && { cache_control: { type: 'ephemeral' } }),
  }));
}

// Local test switch for the error state. Only works outside production.
function shouldForceError(textSent) {
  return process.env.FORCE_ERROR === '1' && process.env.VERCEL_ENV !== 'production' && textSent > 400;
}

// Local development: `vercel dev` only passes `.env` (or the project's cloud
// variables) to functions, so load the key from .env.local ourselves.
// Variables that are already set win, and a missing file is fine (deployed builds).
if (process.env.VERCEL_ENV !== 'production') {
  try {
    process.loadEnvFile(new URL('../.env.local', import.meta.url));
  } catch {}
}

const client = new Anthropic(); // Reads ANTHROPIC_API_KEY from the environment.

export async function POST(request) {
  let question, history, resolved;
  try {
    ({ question, history = [], resolved = null } = await request.json());
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  if (typeof question !== 'string' || !question.trim()) {
    return new Response('Missing question', { status: 400 });
  }
  const validHistory =
    Array.isArray(history) &&
    history.length <= MAX_HISTORY_TURNS &&
    history.every((turn) => isText(turn?.question) && turn.question.trim() && isText(turn?.answer) && turn.answer.trim());
  const validResolved =
    resolved === null ||
    (Number.isInteger(resolved?.position) && isText(resolved?.name) && isText(resolved?.opening));
  if (!validHistory || !validResolved) {
    return new Response('Invalid history', { status: 400 });
  }

  const encoder = new TextEncoder();
  let claudeStream;
  let textSent = 0;
  let stopped = false;

  // ─── SERVER STOP ──────────────────────────────────────────────────────────
  // When the browser cancels its request (the user selected Stop), Vercel fires
  // request.signal (enabled by "supportsCancellation" in vercel.json). We abort
  // the Claude stream right away, so Claude stops generating and we stop paying
  // for output tokens nobody will see. The ReadableStream's cancel() below calls
  // the same function, as a backup for when the reader goes away first.
  function stopClaudeStream(reason) {
    if (stopped) return;
    stopped = true;
    claudeStream?.abort();
    console.log(`[answer] stream stopped: ${reason} (${textSent} characters sent)`);
  }
  request.signal.addEventListener('abort', () => stopClaudeStream('client disconnected'));
  // ──────────────────────────────────────────────────────────────────────────

  const body = new ReadableStream({
    async start(controller) {
      // Each line sent to the browser is one JSON event (newline-delimited JSON).
      const send = (event) => {
        if (!stopped) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      // Every section sent to Claude, so the browser can list cited and not-cited sources.
      send({
        type: 'sections',
        sections: docs.sections.map(({ id, url, pageTitle, guideName, sectionHeading }) => ({
          id,
          url,
          pageTitle,
          guideName,
          sectionHeading,
        })),
      });

      try {
        console.log('[answer] stream started');
        claudeStream = client.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: 'low' },
          system: SYSTEM_PROMPT,
          messages: buildMessages(history, question, resolved),
        });

        const usage = {};
        for await (const event of claudeStream) {
          if (event.type === 'message_start') {
            Object.assign(usage, event.message.usage);
          } else if (event.type === 'content_block_start' && event.content_block.type === 'text') {
            send({ type: 'block', index: event.index });
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              textSent += event.delta.text.length;
              send({ type: 'text', index: event.index, text: event.delta.text });
              if (shouldForceError(textSent)) throw new Error('Forced test error (FORCE_ERROR=1)');
            } else if (event.delta.type === 'citations_delta') {
              const { source, title } = event.delta.citation;
              send({ type: 'citation', index: event.index, url: source, title });
            }
          } else if (event.type === 'message_delta') {
            usage.output_tokens = event.usage?.output_tokens ?? usage.output_tokens;
            send({ type: 'done', stopReason: event.delta.stop_reason });
          }
        }
        if (!stopped) {
          console.log(`[answer] stream finished (${textSent} characters sent)`);
          console.log(
            `[answer] usage: input_tokens=${usage.input_tokens} cache_creation_input_tokens=${usage.cache_creation_input_tokens} cache_read_input_tokens=${usage.cache_read_input_tokens} output_tokens=${usage.output_tokens}`
          );
        }
      } catch (error) {
        if (stopped) return; // The abort we started ends the loop with an error. That's expected.
        console.error('[answer] stream failed:', error.message);
        send({ type: 'error' });
      }
      if (!stopped) controller.close();
    },
    cancel() {
      stopClaudeStream('response stream cancelled');
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
