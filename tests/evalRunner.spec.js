import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { FAKE_QUESTION, fakeEvents, useFakeAnswer } from './fakeAnswer.js';
import { ask, importWithoutNetwork, lastResponse } from './helpers.js';

// Eval runner checks. Free: answers come from the fake answer, passed in where the Claude client would go,
// and Claude's stream is replaced before any POST.

let answer;
let runner;
const realStream = {};

test.beforeAll(async () => {
  [answer, runner] = await importWithoutNetwork(() => Promise.all([import('../api/answer.js'), import('../scripts/run_evals.js')]));
  realStream.stream = answer.client.messages.stream;
  answer.client.messages.stream = () => {
    throw new Error('A test reached the Claude client');
  };
});

test.afterAll(() => {
  answer.client.messages.stream = realStream.stream;
});

const USAGE = { input_tokens: 100, cache_creation_input_tokens: 30_000, cache_read_input_tokens: 0 };

// The fake answer's events, as the Claude stream would send them. Thinking blocks are in there, as at medium effort.
async function* claudeEvents(kind, usage = USAGE) {
  yield { type: 'message_start', message: { usage: { ...usage, output_tokens: 1 } } };
  yield { type: 'content_block_start', index: 999, content_block: { type: 'thinking' } };
  yield { type: 'content_block_delta', index: 999, delta: { type: 'thinking_delta', thinking: 'hidden' } };
  for (const event of fakeEvents(kind)) {
    if (event.type === 'block') yield { type: 'content_block_start', index: event.index, content_block: { type: 'text', text: '' } };
    if (event.type === 'text') yield { type: 'content_block_delta', index: event.index, delta: { type: 'text_delta', text: event.text } };
    if (event.type === 'citation') {
      yield { type: 'content_block_delta', index: event.index, delta: { type: 'citations_delta', citation: { source: event.url, title: event.title } } };
    }
    if (event.type === 'error') throw new Error('Stream failed');
    if (event.type === 'done') yield { type: 'message_delta', delta: { stop_reason: event.stopReason }, usage: { output_tokens: 250 } };
  }
}

function fakeApi(kinds) {
  const queue = [...kinds];
  const requests = [];
  return {
    requests,
    messages: {
      stream(request) {
        requests.push(request);
        return claudeEvents(queue.shift());
      },
    },
  };
}

const run = (kind, options = {}) => runner.runQuestion({ id: 'X', question: FAKE_QUESTION, api: fakeApi([kind]), ...options });

test('the runner sends the same request as the app, byte for byte', async () => {
  const cases = [
    { question: 'One?' },
    { question: 'And per month?', history: [{ question: 'One?', answer: 'Yes.' }] },
    {
      question: 'Tell me more about the third one.',
      history: [{ question: 'One?', answer: '1. A: a\n2. B: b\n3. C: c' }],
      resolved: { position: 3, name: 'C', opening: 'The third one, C: ' },
    },
  ];
  const sent = [];
  answer.client.messages.stream = (request) => {
    sent.push(JSON.stringify(request));
    return claudeEvents('full');
  };
  for (const body of cases) {
    const response = await answer.POST(new Request('http://localhost/api/answer', { method: 'POST', body: JSON.stringify(body) }));
    await response.text();
  }
  expect(sent).toHaveLength(3);
  // No effort argument is the app's own effort, and naming the app's effort gives the same bytes.
  cases.forEach((body, index) => {
    expect(JSON.stringify(runner.evalRequest(body))).toBe(sent[index]);
    expect(JSON.stringify(runner.evalRequest({ ...body, effort: 'low' }))).toBe(sent[index]);
  });

  // Medium changes the effort and nothing else.
  const low = runner.evalRequest(cases[0]);
  const medium = runner.evalRequest({ ...cases[0], effort: 'medium' });
  expect(medium.output_config).toEqual({ effort: 'medium' });
  expect({ ...medium, output_config: low.output_config }).toEqual(low);
});

test('a request cannot change the effort in the deployed app', async () => {
  const sent = [];
  answer.client.messages.stream = (request) => {
    sent.push(request);
    return claudeEvents('full');
  };
  const body = { question: 'One?', effort: 'max', output_config: { effort: 'max' }, max_tokens: 1, model: 'other', system: 'other' };
  await (await answer.POST(new Request('http://localhost/api/answer?effort=max', { method: 'POST', body: JSON.stringify(body) }))).text();
  expect(sent).toHaveLength(1);
  expect(sent[0]).toEqual(answer.claudeRequest({ question: 'One?' }));
  expect(sent[0].output_config).toEqual({ effort: 'low' });
  expect(answer.claudeRequest({ question: 'One?', effort: 'max' }).output_config).toEqual({ effort: 'low' });
});

test('a record has every field, with the marker removed', async () => {
  let clock = 0;
  const { record } = await run('markerFlagged', { effort: 'medium', now: () => (clock += 10) });
  expect(Object.keys(record)).toEqual([
    'id', 'question', 'effort', 'visibleText', 'visibleTextWithMarkers', 'marker', 'ga4', 'badge', 'citedSources',
    'stopReason', 'usage', 'timeToFirstTextMs', 'totalMs', 'costUsd',
  ]);
  expect(record).toMatchObject({ id: 'X', question: FAKE_QUESTION, effort: 'medium', marker: true, ga4: true, badge: 'Low', stopReason: 'end_turn' });
  expect(record.visibleText).toContain('$0.023');
  expect(record.visibleText).not.toContain('NO_ANSWER');
  expect(record.usage).toEqual({ input: 100, cacheWrite: 30_000, cacheRead: 0, output: 250 });
  expect(record.timeToFirstTextMs).toBeGreaterThan(0);
  expect(record.totalMs).toBeGreaterThan(record.timeToFirstTextMs);
});

test('time to first text waits for text the reader can see, not the marker', async () => {
  // The clock moves 100 with each stream event, so the marker's events count toward the wait.
  const timed = async (kind) => {
    let clock = 0;
    const api = { messages: { stream: () => (async function* () {
      for await (const event of claudeEvents(kind)) {
        clock += 100;
        yield event;
      }
    })() } };
    return (await runner.runQuestion({ id: 'X', question: 'Q', api, now: () => clock })).record.timeToFirstTextMs;
  };
  // message_start, 2 thinking events, block, citation, text.
  expect(await timed('costOnly')).toBe(600);
  // The same, with the marker's block and text first.
  expect(await timed('markerFlagged')).toBe(800);
});

test('a response with no text is saved with no time, and its stop reason', async () => {
  const { record } = await runner.runQuestion({
    id: 'X',
    question: 'Q',
    api: { messages: { stream: () => (async function* () {
      yield { type: 'message_start', message: { usage: USAGE } };
      yield { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } };
    })() } },
  });
  expect(record.timeToFirstTextMs).toBeNull();
  expect(record.stopReason).toBe('refusal');
  expect(record.ga4).toBe(true);
});

test('the cited titles are in first-cited order, with all of them listed', async () => {
  const { record } = await run('full');
  expect(record.citedSources).toHaveLength(6);
  expect(record.citedSources[0]).toContain('Requirements');
  expect(new Set(record.citedSources).size).toBe(6);
});

test('cost uses the four prices', () => {
  expect(runner.costOf({ input: 1_000_000, cacheWrite: 0, cacheRead: 0, output: 0 })).toBe(2);
  expect(runner.costOf({ input: 0, cacheWrite: 1_000_000, cacheRead: 0, output: 0 })).toBe(2.5);
  expect(runner.costOf({ input: 0, cacheWrite: 0, cacheRead: 1_000_000, output: 0 })).toBe(0.1);
  expect(runner.costOf({ input: 0, cacheWrite: 0, cacheRead: 0, output: 1_000_000 })).toBe(10);
  expect(runner.costOf({ input: 792, cacheWrite: 0, cacheRead: 30_027, output: 200 })).toBe(0.006587);
});

// Kept after the rules moved to shared code. It no longer guards a copy, but it's the only check that the page
// really uses those functions, and that the grading text (visibleTextWithMarkers) is what the reader sees.
test('the runner matches what the page shows', async ({ page }) => {
  test.setTimeout(120_000);
  // Each row: the fake answer, and the marker the runner should report. The page has no marker to read.
  const resolved = { position: 3, name: 'DSSE-KMS', opening: 'The third one, DSSE-KMS: ' };
  const rows = [
    { kind: 'costOnly', marker: false },
    { kind: 'costMixed', marker: false },
    { kind: 'markerFlagged', marker: true },
    { kind: 'markerCited', marker: true },
    { kind: 'markerUncited', marker: true },
    { kind: 'uncited', marker: false },
    { kind: 'full', marker: false },
    { kind: 'dashes', marker: false },
    { kind: 'twoLists', marker: false },
    { kind: 'skipped', marker: false },
    { kind: 'list', marker: false },
    { kind: 'resolved', marker: false, question: 'Tell me more about the third one.', resolved },
  ];
  await useFakeAnswer(page, rows.map((row) => row.kind));
  await page.goto('/');
  for (const { kind, marker, question = FAKE_QUESTION, resolved: item = null } of rows) {
    await ask(page, question);
    const response = page.getByTestId('response').last();
    await response.getByRole('toolbar', { name: 'Response actions' }).waitFor();
    const { record } = await run(kind, { question, resolved: item });

    // Line by line as it shows, with the numbers and bullets the browser draws for a list.
    const lines = await lastResponse(page).evaluate((element) =>
      [...element.querySelectorAll('p, li')].map((node) => {
        const list = node.parentElement;
        const start = node.tagName !== 'LI' ? '' : list.tagName === 'OL' ? `${[...list.children].indexOf(node) + 1}. ` : '- ';
        return start + node.textContent.replace(/\s+/g, ' ').trim();
      })
    );
    expect(lines, kind).toEqual(record.visibleTextWithMarkers.split(/\n+/));
    // The field the copy button uses keeps its plain text.
    expect(record.visibleText, kind).not.toMatch(/\[\d+\]/);

    expect(record.marker, kind).toBe(marker);
    expect((await response.getByText('Looking for something else?').count()) > 0, kind).toBe(record.ga4);
    const badge = response.getByTestId('overview').getByText(/^(Low|Medium) confidence$/);
    if (record.badge === 'none') await expect(badge, kind).toHaveCount(0);
    else await expect(badge, kind).toHaveText(`${record.badge} confidence`);
    // The list under the response shows the first 5.
    const titles = (await response.locator('[id^="source-"]').allTextContents()).map((text) => text.replace(/^\[\d+\]\s*/, ''));
    expect(titles.length, kind).toBe(Math.min(record.citedSources.length, 5));
    titles.forEach((title, index) => expect(title.startsWith(record.citedSources[index]), kind).toBe(true));
  }
});

test('the questions file gives every id, and FU needs its first question', () => {
  const questions = runner.readQuestions();
  expect(questions.size).toBe(16);
  expect(questions.get('N1').question).toBe('What does S3 Standard storage cost per GB in us-east-1?');
  expect(questions.get('FU')).toEqual({ question: 'Tell me more about the third one.', after: 'F1' });

  const plan = runner.planRuns({ ids: ['N1', 'N2', 'F1'], efforts: ['low', 'medium'], questions });
  expect(plan.map((item) => `${item.id}-${item.effort}`)).toEqual(['N1-low', 'N2-low', 'F1-low', 'N1-medium', 'N2-medium', 'F1-medium']);
  expect(() => runner.planRuns({ ids: ['Z9'], efforts: ['low'], questions })).toThrow('Unknown question id');
  expect(() => runner.planRuns({ ids: ['N1'], efforts: ['huge'], questions })).toThrow('Unknown effort');
  expect(() => runner.planRuns({ ids: ['FU'], efforts: ['low'], questions })).toThrow('FU needs F1');
});

test('FU sends the history and the resolved item, through the app code', async ({}, testInfo) => {
  const questions = new Map([['F1', { question: 'List?' }], ['FU', { question: 'Tell me more about the third one.', after: 'F1' }]]);
  const ids = ['F1', 'FU'];
  const efforts = ['low'];
  const api = fakeApi(['list', 'resolved']);
  const folder = pathToFileURL(`${testInfo.outputPath('fu')}/`);
  const records = await runner.runAll({ runs: runner.planRuns({ ids, efforts, questions }), ids, efforts, folder, api });
  expect(JSON.stringify(api.requests[1].messages)).toContain('The reader means item 3');
  expect(records[1].visibleText.startsWith('The third one, DSSE-KMS: it applies')).toBe(true);
  expect(records[1].visibleTextWithMarkers).toBe('The third one, DSSE-KMS: it applies two layers of encryption to each object, using AWS KMS keys. [1]');
});

test('saves one file per run and compare.md side by side', async ({}, testInfo) => {
  const questions = new Map([['A1', { question: 'First?' }]]);
  const ids = ['A1'];
  const efforts = ['low', 'medium'];
  const folder = pathToFileURL(`${testInfo.outputPath('runs')}/`);
  await runner.runAll({ runs: runner.planRuns({ ids, efforts, questions }), ids, efforts, folder, api: fakeApi(['costOnly', 'markerFlagged']) });

  const saved = JSON.parse(readFileSync(new URL('A1-medium.json', folder), 'utf8'));
  expect(saved).toMatchObject({ effort: 'medium', marker: true, badge: 'Low' });
  const compare = readFileSync(new URL('compare.md', folder), 'utf8');
  expect(compare).toContain('## A1: First?');
  expect(compare).toContain('| | low | medium |');
  expect(compare).toContain('| Marker | no | yes |');
  expect(compare).toContain('| Visible text with [n] | The documentation cites $0.023 per GB per month for the first 50 TB. [1] |');
  for (const label of ['GA-4', 'Badge', 'Cited sources', 'Stop reason', 'Input tokens', 'Cache write tokens', 'Cache read tokens', 'Output tokens', 'Time to first text', 'Total time', 'Cost', 'Visible text']) {
    expect(compare).toContain(`| ${label} |`);
  }
  expect(compare).toContain('$0.023');
});

test('a failed request stops the run and keeps what finished', async ({}, testInfo) => {
  const questions = new Map([['A1', { question: 'First?' }], ['A2', { question: 'Second?' }], ['A3', { question: 'Third?' }]]);
  const ids = ['A1', 'A2', 'A3'];
  const efforts = ['low'];
  const folder = pathToFileURL(`${testInfo.outputPath('failed')}/`);
  const api = fakeApi(['costOnly', 'error', 'costOnly']);
  await expect(runner.runAll({ runs: runner.planRuns({ ids, efforts, questions }), ids, efforts, folder, api })).rejects.toThrow('Stream failed');
  expect(api.requests).toHaveLength(2); // No retry, and the third question never went.
  expect(existsSync(new URL('A1-low.json', folder))).toBe(true);
  expect(existsSync(new URL('A2-low.json', folder))).toBe(false);
  expect(readFileSync(new URL('compare.md', folder), 'utf8')).toContain('## A1');
});

test('a stream that ends with no finish is a failure', async () => {
  const api = { messages: { stream: () => (async function* () {
    yield { type: 'message_start', message: { usage: USAGE } };
  })() } };
  await expect(runner.runQuestion({ id: 'X', question: 'Q', api })).rejects.toThrow('before the response finished');
});

test('the paid run never retries', () => {
  expect(answer.client.withOptions({ maxRetries: 0 }).maxRetries).toBe(0);
  expect(readFileSync(new URL('../scripts/run_evals.js', import.meta.url), 'utf8')).toContain('client.withOptions({ maxRetries: 0 })');
});
