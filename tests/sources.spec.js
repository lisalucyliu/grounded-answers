import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FAKE_QUESTION, useFakeAnswer } from './fakeAnswer.js';
import { ask, lastResponse, promptBox } from './helpers.js';

// GA-2 checks. Free: every answer comes from the fake answer in fakeAnswer.js, never from Claude.

const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));
const sourceTitle = (s) =>
  s.sectionHeading === s.pageTitle ? `${s.pageTitle} · ${s.guideName}` : `${s.pageTitle} · ${s.guideName} › ${s.sectionHeading}`;

const panel = (page) => page.getByTestId('sources-panel');
const railSources = (page) => page.getByRole('button', { name: 'Sources', exact: true });

async function markersInText(page) {
  const text = (await lastResponse(page).textContent()) ?? '';
  return [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))].sort((a, b) => a - b);
}

async function waitForAnswer(page) {
  await page.getByTestId('response').last().getByRole('toolbar', { name: 'Response actions' }).waitFor();
}

// Stops a "hold" answer once its first cited sentences are on screen.
async function stopWhenTextArrives(page) {
  await expect(lastResponse(page)).toContainText('[2]');
  await page.getByRole('button', { name: 'Stop generation' }).click();
  await waitForAnswer(page);
}

async function panelLists(page) {
  const cited = (await panel(page).getByTestId('panel-cited').locator('p').allTextContents()).map((text) => ({
    number: Number(text.match(/^\[(\d+)\]/)[1]),
    title: text.replace(/^\[\d+\]\s*/, '').trim(),
  }));
  const alsoReadHeader = panel(page).getByRole('button', { name: /^Also read, not cited \(\d+\)/ });
  const alsoReadExpandedByDefault = await alsoReadHeader.getAttribute('aria-expanded');
  await alsoReadHeader.click();
  const alsoRead = (await panel(page).getByTestId('panel-also-read').locator('p').allTextContents()).map((text) => text.trim());
  return { cited, alsoRead, alsoReadExpandedByDefault };
}

test('sources list, citation popovers and the Sources panel', async ({ page }) => {
  await useFakeAnswer(page, ['full']);
  await page.goto('/');

  // Before any answer, the rail icon opens nothing.
  await railSources(page).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(railSources(page)).toHaveAttribute('aria-pressed', 'false');

  await ask(page, FAKE_QUESTION);
  await waitForAnswer(page);
  const response = page.getByTestId('response').last();
  const markers = await markersInText(page);
  // A space follows every marker that comes before more text in the same paragraph.
  for (const paragraph of await lastResponse(page).locator('p').allTextContents()) {
    expect(paragraph, 'no text runs into a marker').not.toMatch(/\[\d+\][A-Za-z]/);
  }

  // Under the answer: max 5 cited sources, then "View all sources (25)".
  const underAnswer = (await response.locator('[data-testid="sources"] [id^="source-"]').allTextContents()).map((item) =>
    Number(item.match(/^\[(\d+)\]/)[1])
  );
  expect(underAnswer).toEqual(markers.slice(0, 5));
  const viewAll = response.getByRole('button', { name: 'View all sources (25)' });
  await expect(viewAll).toBeVisible();

  // Every [n] popover links to its section URL, with the #anchor on subsections.
  const sectionUrls = new Map(docs.sections.map((section) => [section.url, section]));
  for (const number of markers) {
    await response.getByRole('button', { name: `Source ${number}`, exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    const href = await dialog.getByRole('link', { name: /Open section/ }).getAttribute('href');
    const section = sectionUrls.get(href);
    expect(section, `[${number}] links to a section that was sent`).toBeTruthy();
    if (section.sectionHeading !== section.pageTitle) expect(href).toContain('#');
    await dialog.getByRole('button', { name: 'Close' }).click();
  }

  // The panel: focus on the title, numbers match the text, cited + also read = 25.
  await viewAll.click();
  await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeFocused();
  await expect(railSources(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(panel(page)).toContainText(`For: ${FAKE_QUESTION}`);
  const { cited, alsoRead, alsoReadExpandedByDefault } = await panelLists(page);
  expect(alsoReadExpandedByDefault).toBe('false');
  expect(cited.map((source) => source.number)).toEqual(markers);
  expect(cited.length + alsoRead.length).toBe(25);
  const citedTitles = new Set(cited.map((source) => source.title));
  expect(alsoRead.filter((title) => citedTitles.has(title))).toEqual([]);
  expect(alsoRead).toEqual(docs.sections.map(sourceTitle).filter((title) => !citedTitles.has(title)));

  // Every link in the panel tells screen readers it opens in a new tab.
  const links = panel(page).getByRole('link');
  for (let index = 0; index < (await links.count()); index++) {
    await expect(links.nth(index)).toHaveAccessibleName(/ Opens in a new tab$/);
  }

  // Escape closes and returns focus to "View all sources".
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(viewAll).toBeFocused();

  // The rail icon opens the latest turn; the close button returns focus to the rail icon.
  await railSources(page).click();
  await expect(page.getByRole('heading', { name: 'Sources', level: 2 })).toBeFocused();
  await page.getByRole('button', { name: 'Close sources' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(railSources(page)).toBeFocused();

  console.log(JSON.stringify({ markers, underAnswer, cited: cited.length, alsoRead: alsoRead.length }));
});

test('0 cited: only "View all sources", and the panel keeps the cited heading', async ({ page }) => {
  await useFakeAnswer(page, ['uncited']);
  await page.goto('/');
  await ask(page, FAKE_QUESTION);
  await waitForAnswer(page);
  const response = page.getByTestId('response').last();
  await expect(response.getByText('Sources', { exact: true })).toHaveCount(0);
  await response.getByRole('button', { name: 'View all sources (25)' }).click();
  await expect(panel(page).getByText('Cited in this answer (0)')).toBeVisible();
  await expect(panel(page).getByTestId('panel-cited').locator('p')).toHaveCount(0);
});

test('after a stop, only sources from the partial text are cited; regenerate closes the panel', async ({ page }) => {
  await useFakeAnswer(page, ['hold', 'full', 'hold', 'full']);
  await page.goto('/');

  // Opened from "View all sources": that button goes away on regenerate, so focus goes to the prompt.
  await ask(page, FAKE_QUESTION);
  await stopWhenTextArrives(page);
  const markers = await markersInText(page);
  await page.getByTestId('response').last().getByRole('button', { name: 'View all sources (25)' }).click();
  const { cited, alsoRead } = await panelLists(page);
  expect(cited.map((source) => source.number)).toEqual(markers);
  expect(cited.length + alsoRead.length).toBe(25);
  await page.getByRole('button', { name: 'Regenerate response' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(promptBox(page)).toBeFocused();
  await waitForAnswer(page);

  // Opened from the rail icon: focus goes back to the rail icon.
  await ask(page, FAKE_QUESTION);
  await stopWhenTextArrives(page);
  await railSources(page).click();
  await expect(panel(page)).toContainText('Cited in this answer (2)');
  await page.getByRole('button', { name: 'Regenerate response' }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(railSources(page)).toBeFocused();

  console.log(JSON.stringify({ partialMarkers: markers, cited: cited.length, alsoRead: alsoRead.length }));
});
