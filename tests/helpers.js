import { readFileSync } from 'node:fs';
import { expect } from '@playwright/test';

export const QUESTION = 'What server-side encryption options can I use for S3 objects?';
export const STOPPED_MESSAGE = 'Stopped. This response is not complete.';

// api/answer.js makes its Claude client when it loads, and that client keeps the fetch it finds.
// So load it through here: a fake key and a fetch that throws, so a test can never reach Claude.
export async function importWithoutNetwork(load) {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
  globalThis.fetch = async () => {
    throw new Error('No network in this test');
  };
  try {
    return await load();
  } finally {
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
  }
}

// Path to the `vercel dev` output, so tests can check the server log.
export function serverLog() {
  const path = process.env.SERVER_LOG;
  if (!path) throw new Error('Set SERVER_LOG to the file that holds the vercel dev output');
  return readFileSync(path, 'utf8');
}

export function countInLog(text) {
  return serverLog().split('\n').filter((line) => line.includes(text)).length;
}

// Records every text written into an aria-live element, so we can count announcements.
export async function recordLiveRegions(page) {
  await page.addInitScript(() => {
    window.__liveAnnouncements = [];
    const seen = new WeakMap();
    new MutationObserver(() => {
      for (const element of document.querySelectorAll('[aria-live]')) {
        const text = element.textContent.trim();
        if (text && seen.get(element) !== text) window.__liveAnnouncements.push(text);
        seen.set(element, text);
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
}

export async function stopAnnouncementCount(page) {
  const announcements = await page.evaluate(() => window.__liveAnnouncements);
  return announcements.filter((text) => text.replace(/\.+$/, '') === STOPPED_MESSAGE.replace(/\.$/, '')).length;
}

export function promptBox(page) {
  return page.getByRole('textbox', { name: 'Ask a question' });
}

// The text of the most recent response. Empty locator text until the first words arrive.
export function lastResponse(page) {
  return page.getByTestId('response').last().getByTestId('response-text');
}

export async function ask(page, question = QUESTION) {
  await promptBox(page).fill(question);
  await page.keyboard.press('Enter');
}

// Waits until some text and at least one citation marker have streamed in.
export async function waitForPartialText(page) {
  await expect
    .poll(async () => {
      const text = (await lastResponse(page).textContent().catch(() => '')) ?? '';
      return text.length >= 60 && /\[\d+\]/.test(text);
    }, { timeout: 60_000, intervals: [100] })
    .toBe(true);
}

// Reads the numbered sources list and the [n] markers in the last response.
export async function sourcesAndMarkers(page) {
  const text = (await lastResponse(page).textContent()) ?? '';
  const byNumber = (a, b) => a - b;
  const markers = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))].sort(byNumber);
  const sourceItems = page.getByTestId('response').last().locator('[id^="source-"]');
  const sources = (await sourceItems.allTextContents()).map((item) => Number(item.match(/^\[(\d+)\]/)[1])).sort(byNumber);
  return { markers, sources };
}
