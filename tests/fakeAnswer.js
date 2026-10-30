import { readFileSync } from 'node:fs';

// A made-up answer for free tests. It never calls Claude.
// useFakeAnswer() adds a script to the Playwright test browser that replaces fetch for
// /api/answer only. Nothing in the app or the server changes, so it can't run in production.

const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));
const SECTIONS = docs.sections.map(({ id, url, pageTitle, guideName, sectionHeading }) => ({
  id,
  url,
  pageTitle,
  guideName,
  sectionHeading,
}));

export const FAKE_QUESTION = 'What do I need to set up before S3 replication works?';

// Sentences from a real F4 answer, so the layout shows realistic text. Each one cites a
// different real section, so the full answer cites 6 sources (one more than the list shows).
const SENTENCES = [
  ['Both the source and destination buckets must have versioning enabled.', 'replication-requirements'],
  ['Versioning is off by default, so you have to turn it on explicitly.', 'Versioning'],
  ['After enabling it, it may take up to 15 minutes to fully propagate.\n\n', 'manage-versioning-examples'],
  ['Amazon S3 must have permission to replicate objects on your behalf, through an IAM role.', 'replication-kms-sse-s3-kms-dsse'],
  ['By default, S3 does not replicate objects encrypted with SSE-KMS or DSSE-KMS.', 'replication-kms-sse-c'],
  ['To replicate objects that existed before the replication configuration, use S3 Batch Replication.', 's3-batch-replication-batch'],
];

// GA-5 fakes. Test text only, written for these tests; it doesn't claim to be AWS doc text.
// A numbered list shaped like the F1 answer, so "the third one" is DSSE-KMS.
const LIST_ANSWER = [
  ['Amazon S3 offers four server-side encryption options.\n\n', 'UsingEncryption'],
  ['1. SSE-S3: server-side encryption with Amazon S3 managed keys, the default for every bucket.\n', 'UsingServerSideEncryption'],
  ['2. SSE-KMS: server-side encryption with AWS KMS keys.\n', 'UsingKMSEncryption'],
  ['3. DSSE-KMS: dual-layer server-side encryption with AWS KMS keys.\n', 'UsingDSSEncryption'],
  ['4. SSE-C: server-side encryption with customer-provided keys.\n\n', 'UsingEncryption'],
  ['Most workloads use SSE-S3 or SSE-KMS', 'UsingEncryption'],
  ['.', null], // Punctuation right after a [n] marker, as in real answers.
];
// Two numbered lists in one answer, so a position is ambiguous.
const TWO_LISTS_ANSWER = [
  ['Before replication works:\n1. Versioning: turn it on for both buckets.\n2. IAM role: give Amazon S3 permission to replicate.\n\n', 'replication-requirements'],
  ['To copy objects that already exist:\n1. Batch Replication: create a Batch Operations job.\n2. Manifest: choose which objects to copy.\n3. Completion report: check the results.', 's3-batch-replication-batch'],
];
// A numbered list where Claude skipped a number (1, 2, 4). It shows as 1, 2, 3.
const SKIPPED_ANSWER = [
  ['Three options:\n\n', 'UsingEncryption'],
  ['1. SSE-S3: server-side encryption with Amazon S3 managed keys.\n', 'UsingServerSideEncryption'],
  ['2. SSE-KMS: server-side encryption with AWS KMS keys.\n', 'UsingKMSEncryption'],
  ['4. DSSE-KMS: dual-layer server-side encryption with AWS KMS keys.', 'UsingDSSEncryption'],
];
// Dash bullets, which the system prompt asks Claude not to use. They should render as a bulleted list.
const DASHES_ANSWER = [
  ['A few caveats to know about:\n\n- Changing the default encryption doesn\'t change existing objects.\n', 'UsingKMSEncryption'],
  ['- By default, S3 doesn\'t replicate SSE-KMS-encrypted objects.', 'replication-kms-sse-s3-kms-dsse'],
];
// A follow-up answer that continues after the code-written opening.
const RESOLVED_ANSWER = [
  ['it applies two layers of encryption to each object, using AWS KMS keys.', 'UsingDSSEncryption'],
];

function title(section) {
  const base = `${section.pageTitle} · ${section.guideName}`;
  return section.sectionHeading === section.pageTitle ? base : `${base} › ${section.sectionHeading}`;
}

// The events the server would send. "cited: false" sends the same text with no citations.
function answerEvents({ cited = true, sentences = SENTENCES } = {}) {
  const events = [{ type: 'sections', sections: SECTIONS }];
  sentences.forEach(([text, sectionId], index) => {
    events.push({ type: 'block', index });
    if (cited && sectionId) {
      const section = docs.sections.find((candidate) => candidate.id === sectionId);
      events.push({ type: 'citation', index, url: section.url, title: title(section) });
    }
    events.push({ type: 'text', index, text });
  });
  return events;
}

const KINDS = {
  full: () => answerEvents(),
  uncited: () => answerEvents({ cited: false }),
  hold: () => answerEvents().slice(0, 7),
  list: () => answerEvents({ sentences: LIST_ANSWER }),
  twoLists: () => answerEvents({ sentences: TWO_LISTS_ANSWER }),
  dashes: () => answerEvents({ sentences: DASHES_ANSWER }),
  skipped: () => answerEvents({ sentences: SKIPPED_ANSWER }),
  resolved: () => answerEvents({ sentences: RESOLVED_ANSWER }),
  holdResolved: () => answerEvents({ sentences: RESOLVED_ANSWER }),
  // Only the sections event, then it waits for Stop: a stop before any text arrives.
  holdEmpty: () => answerEvents().slice(0, 1),
  // Text, then the server's error event, as when the Claude stream fails partway.
  error: () => [...answerEvents().slice(0, 7), { type: 'error' }],
};

// answers: one entry per request, in order: "full", "uncited", "hold", "list", "twoLists", "dashes",
// "skipped", "resolved", "holdResolved", "holdEmpty" or "error". The hold kinds send their text and then wait until the request is cancelled (Stop).
// Each request body is kept in window.__answerRequests, so tests can check the history that was sent.
export async function useFakeAnswer(page, answers) {
  const scripts = answers.map((kind) => ({ events: KINDS[kind](), hold: kind.startsWith('hold') }));
  await page.addInitScript((scripts) => {
    const realFetch = window.fetch;
    let next = 0;
    window.fetch = (input, init) => {
      if (!String(input).includes('/api/answer')) return realFetch(input, init);
      window.__answerRequests = [...(window.__answerRequests ?? []), JSON.parse(init.body)];
      const { events, hold } = scripts[next++];
      const signal = init?.signal;
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        async start(controller) {
          for (const event of events) {
            if (signal?.aborted) return;
            controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          if (hold) {
            signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
            return;
          }
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', stopReason: 'end_turn' }) + '\n'));
          controller.close();
        },
      });
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
    };
  }, scripts);
}
