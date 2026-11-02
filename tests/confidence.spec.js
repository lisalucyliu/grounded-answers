import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { allResultsUrl, confidence } from '../src/streamAnswer.js';
import { useFakeAnswer } from './fakeAnswer.js';
import { ask, lastResponse } from './helpers.js';

// GA-4 and GA-3 checks. Free: answers come from the fake answer, and the Claude request check below stops
// at a stubbed fetch, so nothing reaches Claude.

const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));
const FLAGGED_ID = 'cost-example-1-s3-pricing';
const { reason: REASON, nextStep: NEXT_STEP } = docs.sections.find((section) => section.id === FLAGGED_ID).caution;
const N1 = 'What does S3 Standard storage cost per GB in us-east-1?';

const response = (page) => page.getByTestId('response').last();
const waitForAnswer = (page) => response(page).getByRole('toolbar', { name: 'Response actions' }).waitFor();
const alert = (page) => response(page).getByText('Looking for something else?');
const overview = (page) => response(page).getByTestId('overview');
const badge = (page) => overview(page).getByRole('heading', { level: 2 }).getByText(/^(Low|Medium) confidence$/);

async function stop(page) {
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await waitForAnswer(page);
}

test('GA-4: a complete response with 0 cited shows the Alert and the encoded link', async ({ page }) => {
  await useFakeAnswer(page, ['uncited']);
  await page.goto('/');
  const question = "How long does a Data Exchange export job take for a 50 GB revision? What's next?";
  await ask(page, question);
  await waitForAnswer(page);

  await expect(alert(page)).toBeVisible();
  // No period after the external link (Cloudscape Alert rule).
  await expect(response(page)).toContainText(/Looking for something else\? Search all results on AWS Docs\s*$/);
  await expect(response(page)).not.toContainText('All results');
  const link = response(page).getByRole('link', { name: /^Search all results on AWS Docs/ });
  await expect(link).toHaveAttribute(
    'href',
    "https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=How+long+does+a+Data+Exchange+export+job+take+for+a+50+GB+revision%3F+What%27s+next%3F&searchTab=all"
  );
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link.getByRole('img', { name: 'Opens in a new tab' })).toHaveCount(1);

  // The normal button group, with no regenerate, comes before the Alert. No badge, no Sources list.
  const toolbar = response(page).getByRole('toolbar', { name: 'Response actions' });
  await expect(toolbar.getByRole('button', { name: 'Regenerate response' })).toHaveCount(0);
  const order = await toolbar.evaluate((node, text) => {
    const target = [...document.querySelectorAll('[data-testid="response"] *')].find((el) => el.textContent.startsWith(text));
    return node.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING;
  }, 'Looking for something else?');
  expect(order).toBeTruthy();
  await expect(badge(page)).toHaveCount(0);
  await expect(page.getByText('Next Steps')).toHaveCount(0);

  // Decision 47 as updated Nov 2: no "View all sources" at 0 cited. The rail opens the panel.
  await expect(response(page).getByRole('button', { name: /^View all sources/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sources', exact: true }).click();
  await expect(page.getByTestId('sources-panel').getByText('Cited in this answer (0)')).toBeVisible();
});

test('GA-4: encoding of the link', () => {
  const query = (question) => allResultsUrl(question).split('searchQuery=')[1].split('&searchTab')[0];
  expect(query('How many tags?')).toBe('How+many+tags%3F');
  expect(query('S3 & KMS: 100%')).toBe('S3+%26+KMS%3A+100%25');
  expect(allResultsUrl('a')).toBe('https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=a&searchTab=all');
});

test('GA-4: not on a stopped response with 0 cited, and not on a response that cites', async ({ page }) => {
  await useFakeAnswer(page, ['holdUncited', 'full']);
  await page.goto('/');
  await ask(page);
  await expect(lastResponse(page)).toContainText('Both the source');
  await stop(page);
  await expect(alert(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);

  await ask(page);
  await waitForAnswer(page);
  await expect(alert(page)).toHaveCount(0);
});

test('GA-4 and GA-3: not on an error response', async ({ page }) => {
  await useFakeAnswer(page, ['error']);
  await page.goto('/');
  await ask(page);
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await expect(alert(page)).toHaveCount(0);
  await expect(badge(page)).toHaveCount(0);
});

test('GA-3: all cited flagged is a red Low badge, with the Why? popover', async ({ page }) => {
  await useFakeAnswer(page, ['costOnly']);
  await page.goto('/');
  await ask(page, N1);
  await waitForAnswer(page);

  await expect(badge(page)).toHaveText('Low confidence');
  // At the top of the response, above the text. Sources stay under the answer.
  const y = async (locator) => (await locator.boundingBox()).y;
  expect(await y(badge(page))).toBeLessThan(await y(lastResponse(page)));
  expect(await y(lastResponse(page))).toBeLessThan(await y(response(page).getByTestId('sources')));
  await expect(alert(page)).toHaveCount(0);

  const trigger = overview(page).getByRole('button', { name: 'Why?', exact: true });
  await trigger.click();
  const popover = page.getByRole('dialog');
  await expect(popover.getByText('Why low confidence', { exact: true })).toBeVisible();
  await expect(popover.getByText(REASON, { exact: true })).toBeVisible();
  await expect(popover.getByText(NEXT_STEP, { exact: true })).toBeVisible();
  await popover.getByRole('button', { name: 'Close' }).click();
  await expect(popover).toHaveCount(0);
});

test('GA-3: some cited flagged is a grey Medium badge', async ({ page }) => {
  await useFakeAnswer(page, ['costMixed']);
  await page.goto('/');
  await ask(page, N1);
  await waitForAnswer(page);
  await expect(badge(page)).toHaveText('Medium confidence');
  await overview(page).getByRole('button', { name: 'Why?', exact: true }).click();
  const popover = page.getByRole('dialog');
  await expect(popover.getByText('Why medium confidence', { exact: true })).toBeVisible();
  await expect(popover.getByText(REASON, { exact: true })).toBeVisible();
});

test('GA-3: none flagged is no badge, and no badge while generating', async ({ page }) => {
  await useFakeAnswer(page, ['full', 'holdCost']);
  await page.goto('/');
  await ask(page);
  await waitForAnswer(page);
  await expect(badge(page)).toHaveCount(0);

  await ask(page, N1);
  await expect(lastResponse(page)).toContainText('$0.023');
  await expect(badge(page)).toHaveCount(0);
});

test('GA-3: a stopped response uses the sections cited so far', async ({ page }) => {
  // The flagged sentence arrived, and nothing else did: Low, even though the full answer would be Medium.
  await useFakeAnswer(page, ['holdCost', 'hold', 'holdEmpty']);
  await page.goto('/');
  await ask(page, N1);
  await expect(lastResponse(page)).toContainText('$0.023');
  await stop(page);
  await expect(badge(page)).toHaveText('Low confidence');

  // Stopped with unflagged citations: no badge.
  await ask(page);
  await expect(lastResponse(page)).toContainText('[2]');
  await stop(page);
  await expect(badge(page)).toHaveCount(0);

  // Stopped before any text: no badge.
  await ask(page);
  await page.waitForTimeout(100);
  await stop(page);
  await expect(badge(page)).toHaveCount(0);
});

test('GA-3: the rule, and 1 to 3 reasons with no repeats', () => {
  const flagged = (reason, nextStep = 'Step') => ({ section: { caution: { reason, nextStep } } });
  const plain = { section: {} };
  expect(confidence([])).toBeNull();
  expect(confidence([plain])).toBeNull();
  expect(confidence([flagged('A')]).level).toBe('low');
  expect(confidence([flagged('A'), plain]).level).toBe('medium');
  expect(confidence([flagged('A', 'First'), flagged('A', 'Second'), flagged('B')])).toEqual({
    level: 'low',
    reasons: ['A', 'B'],
    nextStep: 'First',
  });
  expect(confidence(['A', 'B', 'C', 'D'].map((reason) => flagged(reason))).reasons).toEqual(['A', 'B', 'C']);
});

test('docs.json: only the cost example has a caution flag', () => {
  expect(docs.sections.filter((section) => section.caution).map((section) => section.id)).toEqual([FLAGGED_ID]);
});

test('caution is not in the browser request body', async ({ page }) => {
  await useFakeAnswer(page, ['costOnly', 'costOnly']);
  await page.goto('/');
  await ask(page, N1);
  await waitForAnswer(page);
  await ask(page, 'And per month?');
  await waitForAnswer(page);
  const bodies = JSON.stringify(await page.evaluate(() => window.__answerRequests));
  expect(bodies).toContain('And per month?');
  expect(bodies).not.toContain('caution');
  expect(bodies).not.toContain(REASON);
  expect(bodies).not.toContain(NEXT_STEP);
});

test('caution reaches the browser event but not the request to Claude', async () => {
  // The Anthropic client uses this fetch stub, so nothing leaves the machine and the real key is never loaded.
  const sent = [];
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  globalThis.fetch = async (url, init) => {
    sent.push(String(init.body));
    return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'stub' } }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const { POST } = await import('../api/answer.js');
    const request = new Request('http://localhost/api/answer', { method: 'POST', body: JSON.stringify({ question: N1 }) });
    const events = (await (await POST(request)).text()).trim().split('\n').map((line) => JSON.parse(line));
    const sections = events.find((event) => event.type === 'sections').sections;
    expect(sections.filter((section) => section.caution).map((section) => section.id)).toEqual([FLAGGED_ID]);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('$0.023'); // The doc text itself still goes to Claude.
    expect(sent[0]).not.toContain('caution');
    expect(sent[0]).not.toContain(REASON);
    expect(sent[0]).not.toContain(NEXT_STEP);

    // GA-4 marker: Claude is told about it in the system prompt, and it isn't in the doc text.
    const { system, messages } = JSON.parse(sent[0]);
    expect(system).toContain('start your response with [NO_ANSWER] on its own first line');
    expect(JSON.stringify(messages)).not.toContain('NO_ANSWER');
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  }
});
