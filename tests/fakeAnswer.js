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

function title(section) {
  const base = `${section.pageTitle} · ${section.guideName}`;
  return section.sectionHeading === section.pageTitle ? base : `${base} › ${section.sectionHeading}`;
}

// The events the server would send. "cited: false" sends the same text with no citations.
function answerEvents({ cited = true } = {}) {
  const events = [{ type: 'sections', sections: SECTIONS }];
  SENTENCES.forEach(([text, sectionId], index) => {
    events.push({ type: 'block', index });
    if (cited) {
      const section = docs.sections.find((candidate) => candidate.id === sectionId);
      events.push({ type: 'citation', index, url: section.url, title: title(section) });
    }
    events.push({ type: 'text', index, text });
  });
  return events;
}

// answers: one entry per request, in order. Each is "full", "uncited" or "hold".
// "hold" sends the first 2 cited sentences and then waits until the request is cancelled (Stop).
export async function useFakeAnswer(page, answers) {
  const scripts = answers.map((kind) => ({
    events: kind === 'hold' ? answerEvents().slice(0, 7) : answerEvents({ cited: kind !== 'uncited' }),
    hold: kind === 'hold',
  }));
  await page.addInitScript((scripts) => {
    const realFetch = window.fetch;
    let next = 0;
    window.fetch = (input, init) => {
      if (!String(input).includes('/api/answer')) return realFetch(input, init);
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
