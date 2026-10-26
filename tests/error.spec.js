import { expect, test } from '@playwright/test';
import { ask, lastResponse } from './helpers.js';

// 1 real stream. Run only against `vercel dev` started with FORCE_ERROR=1,
// which makes the server fail after about 400 characters of text.
test('error after partial text keeps the text and shows the error alert', async ({ page }) => {
  await page.goto('/');
  await ask(page);

  // Scoped to the response, because the live region also holds a hidden copy of this text.
  const alert = page
    .getByTestId('response')
    .last()
    .getByText("Something went wrong and the response didn't finish. Your question is saved.");
  await expect(alert).toBeVisible({ timeout: 60_000 });

  const partialText = (await lastResponse(page).textContent()) ?? '';
  const result = {
    partialTextKept: partialText.length > 0,
    alertShown: await alert.isVisible(),
    tryAgainButtons: await page.getByRole('button', { name: 'Try again' }).count(),
    responseActionGroups: await page.getByRole('toolbar', { name: 'Response actions' }).count(),
    characters: partialText.length,
  };
  console.log(JSON.stringify(result));
  await page.screenshot({ path: 'test-results/error-state.png' });

  expect(result.partialTextKept).toBe(true);
  expect(result.tryAgainButtons).toBe(1);
  expect(result.responseActionGroups).toBe(0);
});
