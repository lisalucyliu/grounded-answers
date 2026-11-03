// Runs eval questions against Claude and saves what the reader would see. Every run costs money.
//
//   node scripts/run_evals.js --ids N1,N2,F1 --efforts low,medium --label effort
//
// Leave out --efforts to use the app's own effort. Results go to evals/runs/<date>-<label>/.
// The request comes from claudeRequest in api/answer.js and the reader's view from the app's own code in src/.
// It stops at the first failure and never retries.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { claudeRequest, client, sectionsEvent, toAppEvent, updateUsage } from '../api/answer.js';
import { chatHistory, decideFollowUp, readTurn, turnText, visibleLists } from '../src/followUp.js';
import { applyEvent, noAnswerFound, screenText, splitSources, turnConfidence } from '../src/streamAnswer.js';

const QUESTIONS_FILE = new URL('../evals/questions.md', import.meta.url);
const RUNS_FOLDER = new URL('../evals/runs/', import.meta.url);
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

// Dollars per million tokens for claude-sonnet-5-5 (Claude pricing page, checked Nov 2). 5-minute cache writes.
const PRICES = { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 };

export function costOf(usage) {
  const dollars = Object.keys(PRICES).reduce((sum, key) => sum + (usage[key] * PRICES[key]) / 1_000_000, 0);
  return Number(dollars.toFixed(6));
}

// The app's request, with only the effort changed. This is the only place an effort value can come in.
export function evalRequest({ question, history, resolved, effort }) {
  const request = claudeRequest({ question, history, resolved });
  return effort ? { ...request, output_config: { ...request.output_config, effort } } : request;
}

// Adds one stream event, the same way the app does.
const addEvent = (turn, event) => Object.assign(turn, applyEvent(turn, event));

// What the reader sees for a finished turn.
export function readerView(turn) {
  const { blocks, noAnswer } = readTurn(turn);
  const level = turnConfidence(turn)?.level;
  return {
    visibleText: turnText(turn),
    visibleTextWithMarkers: screenText(turn),
    marker: noAnswer,
    ga4: noAnswerFound(turn),
    badge: level ? `${level[0].toUpperCase()}${level.slice(1)}` : 'none',
    citedSources: splitSources(blocks, turn.sections).cited.map((source) => source.title),
  };
}

// One paid request. Returns the saved record and the finished turn, which a follow-up needs.
export async function runQuestion({ id, question, effort, history = [], resolved = null, api, now = () => performance.now() }) {
  const turn = { question, resolved, status: 'streaming', blocks: {}, sections: [] };
  addEvent(turn, sectionsEvent());
  const usage = {};
  const start = now();
  let timeToFirstText = null;
  let stopReason = null;

  for await (const event of api.messages.stream(evalRequest({ question, history, resolved, effort }))) {
    updateUsage(usage, event);
    const appEvent = toAppEvent(event);
    if (!appEvent) continue;
    if (appEvent.type === 'done') stopReason = appEvent.stopReason;
    addEvent(turn, appEvent);
    // Measured to the first text the reader can see, so the time spent holding back the marker counts.
    if (timeToFirstText === null && readTurn(turn).blocks.some((block) => block.text.trim())) timeToFirstText = now() - start;
  }
  const total = now() - start;
  if (stopReason === null) throw new Error('Stream ended before the response finished');
  turn.status = 'complete';

  const tokens = {
    input: usage.input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
  };
  const record = {
    id,
    question,
    effort: effort ?? evalRequest({ question }).output_config.effort,
    ...readerView(turn),
    stopReason,
    usage: tokens,
    timeToFirstTextMs: timeToFirstText === null ? null : Math.round(timeToFirstText),
    totalMs: Math.round(total),
    costUsd: costOf(tokens),
  };
  return { record, turn };
}

// The questions in evals/questions.md, by id. FU is written as a sentence under the table.
export function readQuestions(markdown = readFileSync(QUESTIONS_FILE, 'utf8')) {
  const questions = new Map();
  for (const [, id, question] of markdown.matchAll(/^\| ([A-Z]\d) \| (.+?) \| .+ \|$/gm)) questions.set(id, { question });
  const followUp = markdown.match(/Follow-up test FU: ask (\w+),.*?then ask "([^"]+)"/);
  if (followUp) questions.set('FU', { question: followUp[2], after: followUp[1] });
  return questions;
}

// Decides the whole list before any paid request, so a mistake costs nothing.
export function planRuns({ ids, efforts, questions }) {
  const runs = [];
  for (const effort of efforts) {
    if (effort && !EFFORTS.includes(effort)) throw new Error(`Unknown effort: ${effort}`);
    ids.forEach((id, index) => {
      const found = questions.get(id);
      if (!found) throw new Error(`Unknown question id: ${id}`);
      if (found.after && !ids.slice(0, index).includes(found.after)) throw new Error(`${id} needs ${found.after} earlier in --ids`);
      runs.push({ id, effort, ...found });
    });
  }
  return runs;
}

// Earlier turns as the app would send them. A list question the app would answer without Claude can't be a paid run.
function followUpContext(question, earlier) {
  const decision = decideFollowUp(question, visibleLists(earlier));
  if (decision.kind === 'clarify') throw new Error(`The app would ask "${decision.question}" here, with no request to Claude`);
  return { history: chatHistory(earlier), resolved: decision.resolved ?? null };
}

const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const seconds = (ms) => (ms === null ? 'no text' : `${(ms / 1000).toFixed(1)}s`);
const FIELDS = [
  ['Marker', (run) => (run.marker ? 'yes' : 'no')],
  ['GA-4', (run) => (run.ga4 ? 'yes' : 'no')],
  ['Badge', (run) => run.badge],
  ['Cited sources', (run) => (run.citedSources.length ? `${run.citedSources.length}:<br>${run.citedSources.map((title, i) => `${i + 1}. ${title}`).join('<br>')}` : '0')],
  ['Stop reason', (run) => run.stopReason],
  ['Input tokens', (run) => run.usage.input],
  ['Cache write tokens', (run) => run.usage.cacheWrite],
  ['Cache read tokens', (run) => run.usage.cacheRead],
  ['Output tokens', (run) => run.usage.output],
  ['Time to first text', (run) => seconds(run.timeToFirstTextMs)],
  ['Total time', (run) => seconds(run.totalMs)],
  ['Cost', (run) => `$${run.costUsd.toFixed(4)}`],
  ['Visible text', (run) => run.visibleText],
  ['Visible text with [n]', (run) => run.visibleTextWithMarkers],
];

// For each question, one column per effort. A run that didn't finish shows "not run".
export function compareMarkdown(records, { ids, efforts }) {
  const lines = ['# Effort comparison'];
  for (const id of ids) {
    const runs = efforts.map((effort) => records.find((run) => run.id === id && run.effort === effort));
    const question = runs.find(Boolean)?.question;
    if (!question) continue;
    lines.push('', `## ${id}: ${question}`, '', `| | ${efforts.join(' | ')} |`, `| --- | ${efforts.map(() => '---').join(' | ')} |`);
    for (const [label, read] of FIELDS) {
      lines.push(`| ${label} | ${runs.map((run) => (run ? cell(read(run)) : 'not run')).join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

const runFile = (folder, { id, effort }) => new URL(`${id}-${effort}.json`, folder);

// Saves each run as soon as it finishes, so a failure keeps what was already paid for.
export async function runAll({ runs, ids, efforts, folder, api, log = () => {} }) {
  mkdirSync(folder, { recursive: true });
  const records = [];
  const turns = new Map();
  try {
    for (const run of runs) {
      const earlier = turns.get(run.effort) ?? [];
      const context = run.after ? followUpContext(run.question, earlier) : {};
      log(`${run.id} at ${run.effort}...`);
      const { record, turn } = await runQuestion({ ...run, ...context, api });
      writeFileSync(runFile(folder, record), `${JSON.stringify(record, null, 2)}\n`);
      records.push(record);
      turns.set(run.effort, [...earlier, turn]);
    }
  } finally {
    writeFileSync(new URL('compare.md', folder), compareMarkdown(records, { ids, efforts }));
  }
  return records;
}

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const ids = argument('ids')?.split(',');
  const label = argument('label');
  if (!ids || !label) throw new Error('Use: node scripts/run_evals.js --ids N1,N2,F1 --label name [--efforts low,medium]');
  const appEffort = evalRequest({ question: 'x' }).output_config.effort;
  const efforts = argument('efforts')?.split(',') ?? [appEffort];
  const runs = planRuns({ ids, efforts, questions: readQuestions() });

  const date = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD, local time.
  const folder = new URL(`${date}-${label}/`, RUNS_FOLDER);
  const taken = runs.filter((run) => existsSync(runFile(folder, run)));
  if (taken.length) throw new Error(`Already saved, not paying twice: ${taken.map((run) => `${run.id}-${run.effort}`).join(', ')}`);

  console.log(`${runs.length} paid requests.`);
  // No SDK retries: a failed request stops the run, so the count of paid requests stays exact.
  const records = await runAll({ runs, ids, efforts, folder, api: client.withOptions({ maxRetries: 0 }), log: console.log });
  const total = records.reduce((sum, run) => sum + run.costUsd, 0);
  console.log(`Done: ${records.length} requests, $${total.toFixed(4)}. Saved in evals/runs/${date}-${label}/`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
