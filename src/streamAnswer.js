import { LIST_ITEM, readTurn, startsNewList } from './followUp.js';

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

// Adds one stream event to a turn. Returns only the fields that change.
export function applyEvent(turn, event) {
  if (event.type === 'sections') return { sections: event.sections };
  if (!['block', 'text', 'citation'].includes(event.type)) return {};
  const block = turn.blocks[event.index] ?? { text: '', citations: [] };
  if (event.type === 'block') return { blocks: { ...turn.blocks, [event.index]: { text: '', citations: [] } } };
  if (event.type === 'text') {
    return { status: 'streaming', blocks: { ...turn.blocks, [event.index]: { ...block, text: block.text + event.text } } };
  }
  const citation = { url: event.url, title: event.title };
  return { blocks: { ...turn.blocks, [event.index]: { ...block, citations: [...block.citations, citation] } } };
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

// Removes the first `length` characters of a line's text ("3. ") from its leading text pieces.
function stripPrefix(pieces, length) {
  const result = [];
  let remaining = length;
  for (const piece of pieces) {
    if (remaining > 0 && typeof piece === 'string') {
      const cut = Math.min(remaining, piece.length);
      remaining -= cut;
      if (piece.length > cut) result.push(piece.slice(cut));
    } else {
      result.push(piece);
    }
  }
  return result;
}

// Turns the streamed text blocks into paragraphs and numbered lists, and puts a [n] marker
// after the text that each citation supports. `opening` is the code-written start of a GA-5 answer.
// A piece is text, or { blockIndex, number } for a marker. Response.jsx draws them, and screenText writes them out.
export function buildSegments(blocks, markersByBlock, opening) {
  const lines = [{ pieces: opening ? [opening] : [] }];
  blocks.forEach((block, blockIndex) => {
    // The line that holds this block's last text. A block can end in a line break,
    // and its markers belong with its text, not at the start of the next line.
    let lastWithText = lines.at(-1);
    block.text.split('\n').forEach((part, partIndex) => {
      if (partIndex > 0) lines.push({ pieces: [] });
      if (part.trim()) {
        const line = lines.at(-1);
        // A word right after a [n] marker needs a space ("writes. [2] Next", not "[2]Next").
        // Punctuation doesn't ("[1].", not "[1] .").
        line.pieces.push(typeof line.pieces.at(-1) === 'object' && /^[\p{L}\p{N}(]/u.test(part) ? ` ${part}` : part);
        lastWithText = line;
      }
    });
    for (const number of markersByBlock[blockIndex]) {
      lastWithText.pieces.push({ blockIndex, number });
    }
  });

  // Numbered lines become an ordered list, using the same rule as the parser in followUp.js.
  // Lines "- ..." become a bulleted list, so raw dashes never show. Positions only resolve from numbered lists.
  // Other lines are prose. A blank line ends a paragraph.
  const segments = [];
  let paragraph = null;
  let list = null;
  for (const { pieces } of lines) {
    if (!pieces.some((piece) => typeof piece !== 'string' || piece.trim())) {
      paragraph = null;
      continue;
    }
    const text = pieces.filter((piece) => typeof piece === 'string').join('');
    const item = text.match(LIST_ITEM);
    const bullet = text.match(/^\s*[-•]\s+/);
    if (bullet) {
      if (!list || list.type !== 'ul') {
        list = { type: 'ul', items: [] };
        segments.push(list);
      }
      list.items.push(stripPrefix(pieces, bullet[0].length));
      paragraph = null;
    } else if (item) {
      if (startsNewList(Number(item[1]), list?.type === 'ol' ? list : null)) {
        list = { type: 'ol', items: [] };
        segments.push(list);
      }
      list.items.push(stripPrefix(pieces, item[0].length));
      paragraph = null;
    } else {
      list = null;
      if (paragraph) paragraph.pieces.push(' ');
      else segments.push((paragraph = { type: 'p', pieces: [] }));
      paragraph.pieces.push(...pieces);
    }
  }
  return segments;
}

// The response as plain text the way it shows on screen: [n] markers in place, and lists numbered 1, 2, 3 in order.
// For grading only. The copy button and the chat history use turnText, which has no markers.
export function screenText(turn) {
  const { blocks } = readTurn(turn);
  const { markersByBlock } = collectSources(blocks);
  const line = (pieces) =>
    pieces
      .map((piece) => (typeof piece === 'string' ? piece : ` [${piece.number}]`))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
  return buildSegments(blocks, markersByBlock, turn.resolved?.opening)
    .map((segment) =>
      segment.type === 'p'
        ? line(segment.pieces)
        : segment.items.map((pieces, index) => `${segment.type === 'ol' ? `${index + 1}.` : '-'} ${line(pieces)}`).join('\n')
    )
    .join('\n\n');
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

// GA-3 for one turn, on a complete or stopped response. Runs on the cited sections, with or without the GA-4 marker.
export function turnConfidence(turn) {
  return confidence(splitSources(readTurn(turn).blocks, turn.sections ?? []).cited);
}

// GA-4: the marker on a complete or stopped response, or a complete response that cites nothing.
// An error response keeps only its error Alert.
export function noAnswerFound(turn) {
  const { blocks, noAnswer } = readTurn(turn);
  const finished = turn.status === 'complete' || turn.status === 'stopped';
  return (noAnswer && finished) || (turn.status === 'complete' && collectSources(blocks).sources.length === 0);
}

// GA-4: the live AWS search for this question. URLSearchParams writes spaces as "+" and "?" as "%3F".
export function allResultsUrl(question) {
  const query = new URLSearchParams({ searchPath: 'documentation', searchQuery: question, searchTab: 'all' });
  return `https://docs.aws.amazon.com/search/doc-search.html?${query}`;
}
