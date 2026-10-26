import { expect, test } from '@playwright/test';
import {
  ask,
  countInLog,
  lastResponse,
  promptBox,
  recordLiveRegions,
  sourcesAndMarkers,
  stopAnnouncementCount,
  STOPPED_MESSAGE,
  waitForPartialText,
} from './helpers.js';

// 3 real streams: ask + stop, regenerate + stop, new question + stop.
test('stop keeps partial text, shows status, stops the server stream', async ({ page }) => {
  await recordLiveRegions(page);
  await page.goto('/');
  const results = [];

  async function stopAndCheck(run, expectedRegenerateButtons) {
    await waitForPartialText(page);
    const stoppedBefore = countInLog('[answer] stream stopped');
    const finishedBefore = countInLog('[answer] stream finished');

    await page.getByRole('button', { name: 'Stop generation' }).click();
    const textAtStop = await lastResponse(page).textContent();
    await page.waitForTimeout(2500); // Let anything still in flight arrive, and the live region update.

    const textAfter = await lastResponse(page).textContent();
    await expect.poll(() => countInLog('[answer] stream stopped'), { timeout: 10_000 }).toBe(stoppedBefore + 1);
    const { markers, sources } = await sourcesAndMarkers(page);

    const result = {
      run,
      partialTextStays: textAtStop.length > 0 && textAfter === textAtStop,
      statusShown: await page.getByTestId('response').last().getByText(STOPPED_MESSAGE, { exact: true }).isVisible(),
      regenerateButtons: await page.getByRole('button', { name: 'Regenerate response' }).count(),
      expectedRegenerateButtons,
      serverLoggedStop: countInLog('[answer] stream stopped') === stoppedBefore + 1,
      serverDidNotFinish: countInLog('[answer] stream finished') === finishedBefore,
      sourcesMatchPartialText: sources.length > 0 && JSON.stringify(sources) === JSON.stringify(markers),
      sources: sources.join(','),
      markers: markers.join(','),
      focusOnPrompt: await promptBox(page).evaluate((element) => element === document.activeElement),
      stopAnnouncementsSoFar: await stopAnnouncementCount(page),
      expectedAnnouncements: run,
      characters: textAtStop.length,
    };
    results.push(result);
    console.log(JSON.stringify(result));

    expect.soft(result.partialTextStays, `run ${run}: partial text stays`).toBe(true);
    expect.soft(result.statusShown, `run ${run}: status shows`).toBe(true);
    expect.soft(result.regenerateButtons, `run ${run}: regenerate buttons`).toBe(expectedRegenerateButtons);
    expect.soft(result.serverLoggedStop, `run ${run}: server logged stop`).toBe(true);
    expect.soft(result.serverDidNotFinish, `run ${run}: server did not finish`).toBe(true);
    expect.soft(result.sourcesMatchPartialText, `run ${run}: sources match partial text`).toBe(true);
    expect.soft(result.focusOnPrompt, `run ${run}: focus on prompt`).toBe(true);
    expect.soft(result.stopAnnouncementsSoFar, `run ${run}: live region announcements`).toBe(run);
  }

  await ask(page);
  await stopAndCheck(1, 1);

  // Regenerate once. After that, regenerate should not show again.
  await page.getByRole('button', { name: 'Regenerate response' }).click();
  await stopAndCheck(2, 0);

  // A new question gets its own one-time regenerate.
  await ask(page);
  await stopAndCheck(3, 1);
});
