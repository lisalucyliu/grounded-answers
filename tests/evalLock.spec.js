import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { importWithoutNetwork } from './helpers.js';

// The lock on the eval request. Free: it builds the request and sends nothing.
// Eval results only count for this exact request. ONLY LISA APPROVES A NEW HASH: a new lock means rerunning the evals.
const LOCKED_HASH = '0d50ad0c82dc5f44e750763eb3daa6df5f6fa829e842ae80ef740a9b7be33561';
const FAILURE = 'The eval request changed. Revert the change, or ask Lisa: a new lock means rerunning the evals.';

// One fixed question, as a follow-up with a resolved list item, so the history and the resolved text are covered too.
const FIXED_QUESTION = {
  question: 'Tell me more about the third one.',
  history: [{ question: 'What are my options?', answer: '1. A: first\n2. B: second\n3. C: third' }],
  resolved: { position: 3, name: 'C', opening: 'The third one, C: ' },
};

test('eval lock: the request to Claude has not changed', async () => {
  const { claudeRequest } = await importWithoutNetwork(() => import('../api/answer.js'));
  // The request holds the model, system prompt, effort, max_tokens, citation setup and the doc text Claude reads.
  // The whole of docs.json is added because caution never goes to Claude, and it decides the badge the evals grade.
  const docs = JSON.parse(readFileSync(new URL('../data/docs.json', import.meta.url), 'utf8'));
  const hash = createHash('sha256')
    .update(JSON.stringify({ request: claudeRequest(FIXED_QUESTION), docs }))
    .digest('hex');
  expect(hash, FAILURE).toBe(LOCKED_HASH);
});
