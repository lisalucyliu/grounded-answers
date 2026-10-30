import { expect, test } from '@playwright/test';
import { decideFollowUp, findLists, findPosition, visibleLists } from '../src/followUp.js';
import { useFakeAnswer } from './fakeAnswer.js';
import { ask, lastResponse, recordLiveRegions } from './helpers.js';

// GA-5 and GA-5c checks. Free: answers come from the fake answer in fakeAnswer.js, never from Claude.

const F1 = 'What server-side encryption options can I use for S3 objects?';
const THIRD = 'Tell me more about the third one.';
const F1_LIST = [{ name: 'SSE-S3' }, { name: 'SSE-KMS' }, { name: 'DSSE-KMS' }, { name: 'SSE-C' }];

const requests = (page) => page.evaluate(() => window.__answerRequests ?? []);
const waitForAnswer = (page) =>
  page.getByTestId('response').last().getByRole('toolbar', { name: 'Response actions' }).waitFor();
const clarify = (page) => page.getByTestId('clarify').last();
const optionNames = async (page) => (await clarify(page).getByRole('menuitem').allTextContents()).map((t) => t.trim());

test('parsing: positions and numbered lists', () => {
  const cases = {
    'Tell me more about the third one.': { position: 3, phrase: 'The third one' },
    'What about the 3rd option?': { position: 3, phrase: 'The 3rd option' },
    'Explain option 2': { position: 2, phrase: 'Option 2' },
    'number four please': { position: 4, phrase: 'Number four' },
    'item 10': { position: 10, phrase: 'Item 10' },
    'and the last one?': { last: true, phrase: 'The last one' },
    'tenth item': { position: 10, phrase: 'The tenth item' },
  };
  for (const [question, expected] of Object.entries(cases)) expect(findPosition(question), question).toEqual(expected);
  for (const question of ["What's the first step to enable versioning?", 'First, turn on versioning.', 'How do I add tags?']) {
    expect(findPosition(question), question).toBeNull();
  }

  const text = 'Intro.\n\n1. SSE-S3: a.\n2. SSE-KMS: b.\n\n3. DSSE-KMS: c.\n4. SSE-C: d.\n\nOutro.';
  expect(findLists(text)).toEqual([F1_LIST]);
  expect(findLists('1. A: x\n2. B: y\nProse.\n1. C: z')).toEqual([[{ name: 'A' }, { name: 'B' }], [{ name: 'C' }]]);
  expect(findLists('No list here.')).toEqual([]);

  expect(decideFollowUp(THIRD, [F1_LIST])).toEqual({
    kind: 'resolved',
    resolved: { position: 3, name: 'DSSE-KMS', opening: 'The third one, DSSE-KMS: ' },
  });
  expect(decideFollowUp('the last one', [F1_LIST]).resolved.name).toBe('SSE-C');
  expect(decideFollowUp('the fifth one', [F1_LIST]).kind).toBe('clarify');
  expect(decideFollowUp(THIRD, [[{ name: 'A' }], F1_LIST])).toEqual({
    kind: 'clarify',
    items: ['SSE-S3', 'SSE-KMS', 'DSSE-KMS', 'SSE-C'],
  });
  expect(decideFollowUp(THIRD, []).kind).toBe('normal');
  expect(decideFollowUp('How do I add tags?', [F1_LIST]).kind).toBe('normal');

  // One numbering rule: skipped or repeated numbers stay in one list, shown as 1, 2, 3. Only "1" starts a new list.
  expect(findLists('1. SSE-S3: a\n2. SSE-KMS: b\n4. DSSE-KMS: c')).toEqual([
    [{ name: 'SSE-S3' }, { name: 'SSE-KMS' }, { name: 'DSSE-KMS' }],
  ]);
  expect(findLists('3. Versioning: x\n4. IAM role: y')).toEqual([[{ name: 'Versioning' }, { name: 'IAM role' }]]);

  // Lookback: the latest response with a numbered list, including an error turn's partial text.
  const turn = (status, text) => ({ status, blocks: { 0: { text } } });
  const f1 = turn('complete', '1. SSE-S3: a\n2. SSE-KMS: b');
  expect(visibleLists([f1, turn('complete', 'No list.')])).toEqual([[{ name: 'SSE-S3' }, { name: 'SSE-KMS' }]]);
  expect(visibleLists([f1, turn('error', '1. Versioning: x\n2. IAM role: y')])).toEqual([
    [{ name: 'Versioning' }, { name: 'IAM role' }],
  ]);
  expect(visibleLists([f1, turn('streaming', '1. Partial: z')])[0][0].name).toBe('SSE-S3');
});

test('a numbered list renders as a list, and "the third one" resolves to DSSE-KMS', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'holdResolved', 'resolved', 'full']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);

  // A real ordered list, with [n] popovers inside the items.
  const items = lastResponse(page).locator('ol > li');
  await expect(items).toHaveCount(4);
  expect((await items.allTextContents())[2]).toMatch(/^DSSE-KMS: dual-layer.*\[\d+\]$/);
  // No space between a marker and the punctuation after it.
  expect(await lastResponse(page).textContent()).not.toMatch(/\]\s+[.,;:]/);
  await expect(items.nth(2).getByRole('button', { name: /^Source \d+$/ })).toHaveCount(1);

  // Resolved: loading text and the code-written opening name the item.
  await ask(page, THIRD);
  await expect(page.getByText('Generating a response about DSSE-KMS', { exact: true })).toBeVisible();
  await expect(lastResponse(page)).toHaveText(/^The third one, DSSE-KMS: it applies two layers/);
  const [first, second] = await requests(page);
  expect(first.history).toEqual([]);
  expect(second.resolved).toEqual({ position: 3, name: 'DSSE-KMS', opening: 'The third one, DSSE-KMS: ' });
  expect(second.history).toHaveLength(1);
  expect(second.history[0].question).toBe(F1);
  expect(second.history[0].answer).toMatch(/^Amazon S3 offers four server-side encryption options\.\n\n1\. SSE-S3: /);
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await waitForAnswer(page);

  // A regenerate keeps the resolved item, and the next turn's history includes the opening.
  await page.getByRole('button', { name: 'Regenerate response' }).click();
  await waitForAnswer(page);
  await ask(page, 'Thanks. Which one is the default?');
  await waitForAnswer(page);
  const all = await requests(page);
  expect(all[2].resolved.name).toBe('DSSE-KMS');
  expect(all[3].resolved).toBeNull();
  expect(all[3].history.map((turn) => turn.answer.slice(0, 25))).toEqual([
    'Amazon S3 offers four ser',
    'The third one, DSSE-KMS: ',
  ]);
});

test('GA-5c: out of range asks which one, and a pick resolves the item', async ({ page }) => {
  await recordLiveRegions(page);
  await useFakeAnswer(page, ['list', 'resolved', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);

  await ask(page, 'Tell me more about the fifth one.');
  await expect(clarify(page).getByText('Which option do you mean?', { exact: true })).toBeVisible();
  expect(await optionNames(page)).toEqual(['SSE-S3', 'SSE-KMS', 'DSSE-KMS', 'SSE-C']);
  expect(await requests(page)).toHaveLength(1); // No request for the question.
  // No thumbs, copy, sources or "Next Steps" on this turn.
  await expect(clarify(page).getByRole('toolbar')).toHaveCount(0);
  await expect(clarify(page).getByText('Sources')).toHaveCount(0);
  await expect(page.getByText('Next Steps')).toHaveCount(0);
  // Cloudscape's LiveRegion re-announces the same text by toggling a final period, so ignore extra periods.
  const clarifyAnnouncements = () =>
    page.evaluate(
      () => window.__liveAnnouncements.filter((text) => text.replace(/\.+$/, '') === 'Which option do you mean?').length
    );
  await expect.poll(clarifyAnnouncements).toBe(1);

  // A pick: a gray user bubble with the button text, then a resolved answer.
  await clarify(page).getByRole('menuitem', { name: 'DSSE-KMS', exact: true }).click();
  await waitForAnswer(page);
  await expect(page.locator('[aria-label="Your question"]').last()).toHaveText('DSSE-KMS');
  await expect(lastResponse(page)).toHaveText(/^Option 3, DSSE-KMS: /);
  expect(await clarifyAnnouncements()).toBe(1); // Announced one time only.
  const afterPick = await requests(page);
  expect(afterPick[1].resolved).toEqual({ position: 3, name: 'DSSE-KMS', opening: 'Option 3, DSSE-KMS: ' });
  expect(afterPick[1].history.at(-1)).toEqual({
    question: 'Tell me more about the fifth one.',
    answer: 'Which option do you mean?',
  });

  // A second GA-5c question in a row is announced too.
  await ask(page, 'And the sixth one?');
  await expect.poll(clarifyAnnouncements).toBe(2);

  // The prompts stay, look the same, and can be picked again.
  expect(await optionNames(page)).toEqual(['SSE-S3', 'SSE-KMS', 'DSSE-KMS', 'SSE-C']);
  await page.getByTestId('clarify').first().getByRole('menuitem', { name: 'SSE-KMS', exact: true }).click();
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(/^Option 2, SSE-KMS: /);
});

test('GA-5c: a typed answer to "Which option" resolves against its options', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  await ask(page, 'And item 7?');
  await expect(clarify(page)).toBeVisible();
  await ask(page, 'The second one.');
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(/^The second one, SSE-KMS: /);
});

test('2 lists ask which one, using the latest list', async ({ page }) => {
  await useFakeAnswer(page, ['twoLists']);
  await page.goto('/');
  await ask(page, 'What do I need to set up before S3 replication works?');
  await waitForAnswer(page);
  await expect(lastResponse(page).locator('ol')).toHaveCount(2);
  await ask(page, 'Tell me more about the second one.');
  await expect(clarify(page)).toBeVisible();
  expect(await optionNames(page)).toEqual(['Batch Replication', 'Manifest', 'Completion report']);
  expect(await requests(page)).toHaveLength(1);
});

test('no list: the follow-up goes to Claude as normal, with history', async ({ page }) => {
  await useFakeAnswer(page, ['full', 'full']);
  await page.goto('/');
  await ask(page, 'What do I need to set up before S3 replication works?');
  await waitForAnswer(page);
  await ask(page, THIRD);
  await waitForAnswer(page);
  await expect(page.getByTestId('clarify')).toHaveCount(0);
  const [, second] = await requests(page);
  expect(second.resolved).toBeNull();
  expect(second.history).toHaveLength(1);
  await expect(lastResponse(page)).not.toHaveText(/^The third one/);
});

test('lookback: F1 (list), "the third one" (no list), then "the second one" resolves from F1', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'resolved', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  await ask(page, THIRD);
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(/^The third one, DSSE-KMS: /);
  await ask(page, 'And the second one?');
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(/^The second one, SSE-KMS: /);
  const third = (await requests(page))[2];
  expect(third.resolved).toEqual({ position: 2, name: 'SSE-KMS', opening: 'The second one, SSE-KMS: ' });
  expect(third.history).toHaveLength(2);
});

test('lookback: a newer response with its own list wins', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'twoLists']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  await ask(page, 'What do I need to set up before S3 replication works?');
  await waitForAnswer(page);
  await ask(page, 'Tell me more about the second one.');
  await expect(clarify(page)).toBeVisible();
  expect(await optionNames(page)).toEqual(['Batch Replication', 'Manifest', 'Completion report']);
});

test('dash lines render as a bulleted list, and positions only resolve from numbered lists', async ({ page }) => {
  await useFakeAnswer(page, ['dashes', 'full']);
  await page.goto('/');
  await ask(page, 'What should I watch out for with SSE-KMS?');
  await waitForAnswer(page);
  await expect(lastResponse(page).locator('ul > li')).toHaveCount(2);
  expect(await lastResponse(page).textContent()).not.toContain('- ');
  await ask(page, 'Tell me more about the second one.');
  await waitForAnswer(page);
  await expect(page.getByTestId('clarify')).toHaveCount(0);
  expect((await requests(page))[1].resolved).toBeNull();
});

test('the parser and the renderer agree: "the third one" is the third item on screen', async ({ page }) => {
  // Claude skips a number: 1, 2, 4. The list shows 1, 2, 3, and "the third one" is the third item shown.
  await useFakeAnswer(page, ['skipped', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  const items = lastResponse(page).locator('ol');
  await expect(items).toHaveCount(1);
  await expect(items.locator('li')).toHaveCount(3);
  const shown = await items.locator('li').evaluateAll((lis) => lis.map((li) => li.textContent.split(':')[0]));
  await ask(page, THIRD);
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(new RegExp(`^The third one, ${shown[2]}: `));
});

test('a resolved answer stopped before any text keeps the opening, the stop status and Regenerate', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'holdEmpty', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  await ask(page, THIRD);
  await expect(page.getByText('Generating a response about DSSE-KMS', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await waitForAnswer(page);
  const response = page.getByTestId('response').last();
  await expect(response.getByTestId('response-text')).toHaveText('The third one, DSSE-KMS:');
  await expect(response.getByText('Stopped. This response is not complete.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate response' })).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate response' }).click();
  await waitForAnswer(page);
  await expect(lastResponse(page)).toHaveText(/^The third one, DSSE-KMS: it applies/);
});

test('the prompt group is named by its question', async ({ page }) => {
  await useFakeAnswer(page, ['list']);
  await page.goto('/');
  await ask(page, F1);
  await waitForAnswer(page);
  await ask(page, 'Tell me more about the fifth one.');
  await expect(clarify(page).getByRole('menubar', { name: 'Which option do you mean?' })).toBeVisible();
});

