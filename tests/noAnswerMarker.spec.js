import { expect, test } from '@playwright/test';
import { readTurn, turnText } from '../src/followUp.js';
import { NO_ANSWER_MESSAGE, useFakeAnswer } from './fakeAnswer.js';
import { ask, lastResponse, recordLiveRegions } from './helpers.js';

// GA-4 marker checks. Free: answers come from the fake answer, never from Claude.

const N2 = 'How long does a Data Exchange export job take for a 50 GB revision?';
const response = (page) => page.getByTestId('response').last();
const toolbar = (page) => response(page).getByRole('toolbar', { name: 'Response actions' });
const alert = (page) => response(page).getByText('Looking for something else?');
const stop = (page) => page.getByRole('button', { name: 'Stop generation' }).click();

// Remembers if any part of the marker ever reaches the page, in the visible text or the live region.
async function watchForMarker(page) {
  await page.addInitScript(() => {
    window.__sawMarker = [];
    new MutationObserver(() => {
      const text = document.body?.textContent ?? '';
      const hit = text.match(/\[NO|NO_ANS|ANSWER\]/);
      if (hit) window.__sawMarker.push(hit[0]);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

// Keeps what the copy button writes, so the test can read it.
async function recordCopies(page) {
  await page.addInitScript(() => {
    window.__copied = [];
    navigator.clipboard.writeText = async (text) => {
      window.__copied.push(text);
    };
  });
}

const blocks = (...texts) => Object.fromEntries(texts.map((text, index) => [index, { text, citations: [] }]));
const visible = (status, ...texts) => {
  const { blocks: kept, noAnswer } = readTurn({ status, blocks: blocks(...texts) });
  return [kept.map((block) => block.text).join(''), noAnswer];
};

test('the rule: holding back the first line, across block boundaries', () => {
  expect(visible('streaming', '')).toEqual(['', false]);
  expect(visible('streaming', '[NO_')).toEqual(['', false]);
  expect(visible('streaming', '[NO_', 'ANSWER')).toEqual(['', false]);
  expect(visible('streaming', '[NO_ANSWER]')).toEqual(['', false]); // The line isn't complete yet.
  expect(visible('streaming', '[NO_ANSWER]  ')).toEqual(['', false]);
  expect(visible('streaming', '[NO_ANSWER]\n')).toEqual(['', true]);
  expect(visible('streaming', '[NO_', 'ANSWER]\n\nNot', ' covered.')).toEqual(['Not covered.', true]);
  expect(visible('streaming', '\n[NO_ANSWER]\nNot covered.')).toEqual(['Not covered.', true]);

  // Released as soon as it can't be the marker.
  expect(visible('streaming', 'The docs')).toEqual(['The docs', false]);
  expect(visible('streaming', '[1] The docs')).toEqual(['[1] The docs', false]);
  expect(visible('streaming', '[NO_')[0]).toBe('');
  expect(visible('streaming', '[NOT')).toEqual(['[NOT', false]);

  // Stopped or in error before the line is complete: no marker, and the fragment stays hidden.
  expect(visible('stopped', '[NO_ANS')).toEqual(['', false]);
  expect(visible('stopped', '[NO_ANSWER]')).toEqual(['', false]);
  expect(visible('error', '[NO_ANS')).toEqual(['', false]);
  expect(visible('stopped', '[NO_ANSWER]\nNot covered.')).toEqual(['Not covered.', true]);

  // A complete response has nothing more to come.
  expect(visible('complete', '[NO_ANSWER]')).toEqual(['', true]);
  expect(visible('complete', '[')).toEqual(['[', false]);

  // Only at the start of the response.
  expect(visible('complete', 'See [NO_ANSWER]')).toEqual(['See [NO_ANSWER]', false]);

  const turn = { status: 'complete', resolved: { opening: 'The third one, DSSE-KMS: ' }, blocks: blocks('[NO_ANSWER]\nnot covered.') };
  expect(turnText(turn)).toBe('The third one, DSSE-KMS: not covered.');
});

test('hidden while streaming, not copied, not announced, not in history; GA-4 shows', async ({ page }) => {
  await watchForMarker(page);
  await recordCopies(page);
  await recordLiveRegions(page);
  await useFakeAnswer(page, ['markerUncited', 'full']);
  await page.goto('/');
  await ask(page, N2);
  await toolbar(page).waitFor();

  await expect(lastResponse(page)).toHaveText(NO_ANSWER_MESSAGE);
  await expect(alert(page)).toBeVisible();

  await toolbar(page).getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => window.__copied)).toEqual([NO_ANSWER_MESSAGE]);
  await expect.poll(() => page.evaluate(() => window.__liveAnnouncements)).toContain(NO_ANSWER_MESSAGE);

  await ask(page, 'And per GB?');
  await expect(response(page).getByRole('toolbar', { name: 'Response actions' })).toBeVisible();
  const requests = await page.evaluate(() => window.__answerRequests);
  expect(requests[1].history).toEqual([{ question: N2, answer: NO_ANSWER_MESSAGE }]);
  expect(JSON.stringify(requests)).not.toContain('NO_ANSWER');
  expect(await page.evaluate(() => window.__sawMarker)).toEqual([]);
});

test('while held back, the loading status shows and no text or Overview does', async ({ page }) => {
  await useFakeAnswer(page, ['holdMarkerPartial']);
  await page.goto('/');
  await ask(page, N2);
  await expect(response(page).getByText('Generating a response')).toBeVisible();
  await page.waitForTimeout(200);
  await expect(lastResponse(page)).toHaveCount(0);
  await expect(response(page).getByTestId('overview')).toHaveCount(0);
});

test('GA-4 shows with the marker even when the response cites sources, and they still show', async ({ page }) => {
  await useFakeAnswer(page, ['markerCited']);
  await page.goto('/');
  await ask(page, N2);
  await toolbar(page).waitFor();
  await expect(alert(page)).toBeVisible();
  await expect(response(page).getByTestId('sources').locator('[id^="source-"]')).toHaveCount(1);
  await expect(response(page).getByRole('button', { name: 'View all sources', exact: true })).toBeVisible();
  await expect(lastResponse(page)).not.toContainText('NO_ANSWER');
});

test('marker and a cited flagged section: Overview with the badge and "Why?", the text, then GA-4', async ({ page }) => {
  await recordLiveRegions(page);
  await useFakeAnswer(page, ['markerFlagged']);
  await page.goto('/');
  await ask(page, 'What does S3 Standard storage cost per GB in us-east-1?');
  await toolbar(page).waitFor();

  const heading = response(page).getByRole('heading', { level: 2, name: 'Overview Low confidence', exact: true });
  const why = response(page).getByTestId('overview').getByRole('button', { name: 'Why?', exact: true });
  await expect(heading).toBeVisible();
  await expect(why).toBeVisible();
  await expect(lastResponse(page)).toContainText('$0.023');
  await expect(lastResponse(page)).not.toContainText('NO_ANSWER');
  await expect(alert(page)).toBeVisible();

  const y = async (locator) => (await locator.boundingBox()).y;
  expect(await y(heading)).toBeLessThan(await y(lastResponse(page)));
  expect(await y(lastResponse(page))).toBeLessThan(await y(alert(page)));

  await expect.poll(() => page.evaluate(() => window.__liveAnnouncements)).toContainEqual(expect.stringMatching(/^Low confidence\. The documentation cites/));
});

test('marker and 0 cited: GA-4 only, no badge', async ({ page }) => {
  await useFakeAnswer(page, ['markerUncited']);
  await page.goto('/');
  await ask(page, N2);
  await toolbar(page).waitFor();
  await expect(alert(page)).toBeVisible();
  await expect(response(page).getByText(/(Low|Medium) confidence/)).toHaveCount(0);
  await expect(response(page).getByRole('button', { name: 'Why?' })).toHaveCount(0);
});

test('stopped before the marker line is complete: no marker, no fragment, no GA-4', async ({ page }) => {
  for (const kind of ['holdMarkerPartial', 'holdMarkerNoNewline']) {
    await watchForMarker(page);
    await useFakeAnswer(page, [kind]);
    await page.goto('/');
    await ask(page, N2);
    await page.waitForTimeout(200);
    await stop(page);
    await toolbar(page).waitFor();
    await expect(response(page)).toContainText('Stopped. This response is not complete.');
    await expect(lastResponse(page)).toHaveCount(0);
    await expect(alert(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.__sawMarker)).toEqual([]);
  }
});

test('stopped after the marker line: GA-4 shows, the text stays', async ({ page }) => {
  await useFakeAnswer(page, ['holdMarkerLine']);
  await page.goto('/');
  await ask(page, N2);
  await expect(lastResponse(page)).toHaveText(NO_ANSWER_MESSAGE);
  await stop(page);
  await toolbar(page).waitFor();
  await expect(alert(page)).toBeVisible();
});

test('an error after the marker line keeps only its error Alert', async ({ page }) => {
  await useFakeAnswer(page, ['errorMarker']);
  await page.goto('/');
  await ask(page, N2);
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await expect(lastResponse(page)).toHaveText(NO_ANSWER_MESSAGE);
  await expect(alert(page)).toHaveCount(0);
});
