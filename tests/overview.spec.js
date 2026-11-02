import { expect, test } from '@playwright/test';
import { useFakeAnswer } from './fakeAnswer.js';
import { ask, lastResponse, promptBox, recordLiveRegions, stopAnnouncementCount } from './helpers.js';

// Overview heading, announcements and Try again. Free: answers come from the fake answer, never from Claude.

const F1 = 'What server-side encryption options can I use for S3 objects?';
const N1 = 'What does S3 Standard storage cost per GB in us-east-1?';
const COST_TEXT = 'The documentation cites $0.023 per GB per month for the first 50 TB.';
const STOPPED = 'Stopped. This response is not complete.';

const response = (page) => page.getByTestId('response').last();
const toolbar = (page) => response(page).getByRole('toolbar', { name: 'Response actions' });
const overview = (page) => response(page).getByRole('heading', { level: 2, name: /^Overview/ });
const stop = (page) => page.getByRole('button', { name: 'Stop generation' }).click();
const tryAgain = (page) => page.getByRole('button', { name: 'Try again' });
const announcements = (page) => page.evaluate(() => window.__liveAnnouncements);

test('Overview: on complete, GA-4 and stopped responses, above the text', async ({ page }) => {
  await useFakeAnswer(page, ['full', 'uncited', 'hold', 'holdEmpty']);
  await page.goto('/');

  await ask(page, F1);
  await toolbar(page).waitFor();
  await expect(overview(page)).toHaveAccessibleName('Overview');
  const y = async (locator) => (await locator.boundingBox()).y;
  expect(await y(overview(page))).toBeLessThan(await y(lastResponse(page)));

  await ask(page, F1); // GA-4
  await toolbar(page).waitFor();
  await expect(response(page).getByText('Looking for something else?')).toBeVisible();
  await expect(overview(page)).toBeVisible();

  await ask(page, F1); // Stopped with text
  await expect(lastResponse(page)).toContainText('[2]');
  await expect(overview(page)).toBeVisible(); // It shows while text streams too.
  await stop(page);
  await toolbar(page).waitFor();
  await expect(overview(page)).toBeVisible();

  await ask(page, F1); // Stopped before any text
  await page.waitForTimeout(100);
  await expect(overview(page)).toHaveCount(0);
  await stop(page);
  await toolbar(page).waitFor();
  await expect(overview(page)).toBeVisible();
});

test('Overview: on resolved follow-ups, not on GA-5c question turns', async ({ page }) => {
  await useFakeAnswer(page, ['list', 'resolved', 'resolved']);
  await page.goto('/');
  await ask(page, F1);
  await toolbar(page).waitFor();

  await ask(page, 'Tell me more about the third one.');
  await expect(lastResponse(page)).toContainText('The third one, DSSE-KMS: it applies');
  await toolbar(page).waitFor();
  await expect(overview(page)).toBeVisible();

  await ask(page, 'Tell me more about the ninth one.');
  const clarify = page.getByTestId('clarify').last();
  await clarify.getByRole('menuitem').first().waitFor();
  await expect(clarify.getByRole('heading')).toHaveCount(0);
  await expect(clarify).not.toContainText('Overview');
});

test('Overview: on error turns with partial text, not on error turns with no text', async ({ page }) => {
  await useFakeAnswer(page, ['error', 'errorEmpty']);
  await page.goto('/');
  await ask(page, F1);
  await expect(tryAgain(page)).toBeVisible();
  await expect(overview(page)).toBeVisible();

  await ask(page, F1);
  await expect(tryAgain(page)).toHaveCount(2);
  await expect(overview(page)).toHaveCount(0);
});

test('Overview: not in the copied text or the history', async ({ page }) => {
  await page.addInitScript(() => {
    window.__copied = [];
    navigator.clipboard.writeText = async (text) => {
      window.__copied.push(text);
    };
  });
  await useFakeAnswer(page, ['costOnly', 'full']);
  await page.goto('/');
  await ask(page, N1);
  await toolbar(page).waitFor();
  await toolbar(page).getByRole('button', { name: 'Copy' }).click();
  expect(await page.evaluate(() => window.__copied)).toEqual([COST_TEXT]);

  await ask(page, F1);
  await toolbar(page).waitFor();
  const history = (await page.evaluate(() => window.__answerRequests))[1].history;
  expect(history).toEqual([{ question: N1, answer: COST_TEXT }]);
});

test('badge: inside the h2, "Why?" outside it, 8px apart, at the top, and the text does not move', async ({ page }) => {
  await useFakeAnswer(page, ['costOnly']);
  await page.goto('/');
  await ask(page, N1);
  await expect(lastResponse(page)).toContainText('$0.023');
  const textBefore = await lastResponse(page).boundingBox();
  await toolbar(page).waitFor();

  const heading = response(page).getByRole('heading', { level: 2, name: 'Overview Low confidence', exact: true });
  await expect(heading).toBeVisible();
  await expect(heading.getByText('Low confidence', { exact: true })).toBeVisible();

  const why = response(page).getByTestId('overview').getByRole('button', { name: 'Why?', exact: true });
  await expect(why).toBeVisible();
  await expect(heading.getByRole('button')).toHaveCount(0);

  const gaps = await heading.evaluate((h2, whyText) => {
    const range = document.createRange();
    range.selectNode(h2.firstChild);
    const textRight = range.getBoundingClientRect().right;
    const badge = h2.querySelector('[class*="badge"]').getBoundingClientRect();
    const trigger = [...h2.closest('[data-testid="overview"]').querySelectorAll('button')].find((b) => b.textContent === whyText);
    return { textToBadge: badge.left - textRight, badgeToWhy: trigger.getBoundingClientRect().left - badge.right };
  }, 'Why?');
  expect(gaps).toEqual({ textToBadge: 8, badgeToWhy: 8 });

  // The badge arrives in the heading's row, so the response text stays where it was.
  expect((await lastResponse(page).boundingBox()).y).toBe(textBefore.y);
});

test('announcement: badge text comes first, for Low, Medium and stopped; nothing added with no badge', async ({ page }) => {
  await recordLiveRegions(page);
  await useFakeAnswer(page, ['costOnly', 'costMixed', 'holdCost', 'full', 'hold']);
  await page.goto('/');

  await ask(page, N1);
  await toolbar(page).waitFor();
  await expect.poll(() => announcements(page)).toContain(`Low confidence. ${COST_TEXT}`);

  await ask(page, N1);
  await toolbar(page).waitFor();
  await expect.poll(() => announcements(page)).toContainEqual(expect.stringMatching(/^Medium confidence\. The documentation cites/));

  await ask(page, N1);
  await expect(lastResponse(page)).toContainText('$0.023');
  await stop(page);
  await expect.poll(() => announcements(page)).toContain(`Low confidence. ${STOPPED}`);

  await ask(page, F1);
  await toolbar(page).waitFor();
  await expect.poll(() => announcements(page)).toContainEqual(expect.stringMatching(/^Both the source and destination/));

  await ask(page, F1);
  await expect(lastResponse(page)).toContainText('[2]');
  await stop(page);
  await expect.poll(() => stopAnnouncementCount(page)).toBe(1);
});

test('Try again: hidden on every error turn while any response generates, back after', async ({ page }) => {
  await useFakeAnswer(page, ['error', 'error', 'hold', 'hold']);
  await page.goto('/');
  await ask(page, F1);
  await expect(tryAgain(page)).toHaveCount(1);
  await ask(page, F1);
  await expect(tryAgain(page)).toHaveCount(2);

  // A new question: gone from both turns, while their error messages stay.
  await ask(page, F1);
  await expect(tryAgain(page)).toHaveCount(0);
  await expect(page.getByText("Something went wrong and the response didn't finish.")).toHaveCount(2);
  await stop(page);
  await expect(tryAgain(page)).toHaveCount(2);

  // Try again itself: its own turn is regenerating, and the other turn's button hides too.
  await tryAgain(page).first().click();
  await expect(tryAgain(page)).toHaveCount(0);
  await stop(page);
  await expect(tryAgain(page)).toHaveCount(1);
  await expect(promptBox(page)).toBeVisible();
});
