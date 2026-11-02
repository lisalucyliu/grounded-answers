import { readTurn } from './followUp.js';

// Calls /api/answer and passes each newline-delimited JSON event to onEvent.
// Pass an AbortSignal to cancel. Cancelling closes the connection, which is
// what tells the server to stop the Claude stream.
// history: earlier turns as { question, answer }. resolved: the list item code resolved (GA-5), or null.
export async function streamAnswer(question, { history = [], resolved = null, signal, onEvent }) {
  const response = await fetch('/api/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history, resolved }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === 'done') finished = true;
      if (event.type === 'error') throw new Error('Server reported a stream error');
      onEvent(event);
    }
  }

  // A stream that ends without a "done" event was cut off.
  if (!finished) throw new Error('Stream ended before the response finished');
}

// Numbers sources by the order they're first cited, one number per section URL.
// Only citations attached to text that actually arrived are counted.
export function collectSources(blocks) {
  const numbers = new Map();
  const sources = [];
  const markersByBlock = blocks.map((block) => {
    if (!block.text.trim()) return [];
    const markers = [];
    for (const citation of block.citations) {
      if (!numbers.has(citation.url)) {
        numbers.set(citation.url, sources.length + 1);
        sources.push({ number: sources.length + 1, url: citation.url, title: citation.title });
      }
      const number = numbers.get(citation.url);
      if (!markers.includes(number)) markers.push(number);
    }
    return markers;
  });
  return { sources, markersByBlock };
}

// "page title · guide name › section". The section part only shows when it differs from the page title.
// Same rule as the server's search result titles.
export function sourceTitle(section) {
  const base = `${section.pageTitle} · ${section.guideName}`;
  return section.sectionHeading === section.pageTitle ? base : `${base} › ${section.sectionHeading}`;
}

// Splits the sections the server sent into cited (numbered, by first citation)
// and also read (every other section, in the order they were sent).
export function splitSources(blocks, sections) {
  const { sources } = collectSources(blocks);
  const byUrl = new Map(sections.map((section) => [section.url, section]));
  const cited = sources.map((source) => ({ ...source, section: byUrl.get(source.url) }));
  const citedUrls = new Set(sources.map((source) => source.url));
  const alsoRead = sections.filter((section) => !citedUrls.has(section.url));
  return { cited, alsoRead };
}

const MAX_REASONS = 3;

// GA-3: the confidence badge, from the caution flags on the cited sections.
// All flagged is low, some flagged is medium. None flagged or none cited is no badge (null).
// Reasons don't repeat, and the next step comes from the first flagged source.
export function confidence(cited) {
  const flagged = cited.filter((source) => source.section?.caution);
  if (flagged.length === 0) return null;
  return {
    level: flagged.length === cited.length ? 'low' : 'medium',
    reasons: [...new Set(flagged.map((source) => source.section.caution.reason))].slice(0, MAX_REASONS),
    nextStep: flagged[0].section.caution.nextStep,
  };
}

// GA-3 for one turn, on a complete or stopped response. With the GA-4 marker there's no badge: GA-4 takes its place.
export function turnConfidence(turn) {
  const { blocks, noAnswer } = readTurn(turn);
  return noAnswer ? null : confidence(splitSources(blocks, turn.sections ?? []).cited);
}

// GA-4: the live AWS search for this question. URLSearchParams writes spaces as "+" and "?" as "%3F".
export function allResultsUrl(question) {
  const query = new URLSearchParams({ searchPath: 'documentation', searchQuery: question, searchTab: 'all' });
  return `https://docs.aws.amazon.com/search/doc-search.html?${query}`;
}
