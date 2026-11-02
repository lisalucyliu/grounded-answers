// GA-5: follow-ups that name a list item ("the third one").
// Code resolves the item from the numbered list the reader can see, so Claude never has to guess.

export const CLARIFY_QUESTION = 'Which option do you mean?';

// Out of range: the question says how many options there are, using the real count.
export function outOfRangeQuestion(count) {
  return `${count === 1 ? 'There is 1 option' : `There are ${count} options`}. Which one do you mean?`;
}

const ORDINAL_WORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ORDINAL = `(${ORDINAL_WORDS.join('|')}|(?:10|[1-9])(?:st|nd|rd|th))`;
const NUMBER = `(10|[1-9]|${NUMBER_WORDS.join('|')})`;
const POINTER = '(one|option|item)';

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function ordinalValue(word) {
  const lower = word.toLowerCase();
  const index = ORDINAL_WORDS.indexOf(lower);
  return index >= 0 ? index + 1 : Number.parseInt(lower, 10);
}

function numberValue(word) {
  const lower = word.toLowerCase();
  const index = NUMBER_WORDS.indexOf(lower);
  return index >= 0 ? index + 1 : Number.parseInt(lower, 10);
}

// Finds a list position in a follow-up. A position needs a pointer word ("the third one", "third option",
// "3rd item", "number 3", "option 3", "item 3", "the last one"), so "What's the first step to enable
// versioning?" doesn't count. Returns { position | last, phrase } or null.
// phrase is the reader's own wording, capitalized for the opening: "The third one", "Option 3".
export function findPosition(question) {
  const last = question.match(new RegExp(`\\b(the\\s+)?last\\s+${POINTER}\\b`, 'i'));
  if (last) return { last: true, phrase: capitalize(last[1] ? last[0] : `the ${last[0]}`) };

  const ordinal = question.match(new RegExp(`\\b(the\\s+)?${ORDINAL}\\s+${POINTER}\\b`, 'i'));
  if (ordinal) {
    return { position: ordinalValue(ordinal[2]), phrase: capitalize(ordinal[1] ? ordinal[0] : `the ${ordinal[0]}`) };
  }

  const numbered = question.match(new RegExp(`\\b(number|option|item)\\s+(?:#\\s*)?${NUMBER}\\b`, 'i'));
  if (numbered) return { position: numberValue(numbered[2]), phrase: capitalize(numbered[0]) };

  return null;
}

// One numbering rule for the parser here and the renderer in Response.jsx, so "the third one" is always the
// third item on screen. A list is a run of numbered lines ("1. ...", "2) ..."), with blank lines allowed between
// items. A prose line ends the list, and a line numbered 1 starts a new one. Other numbers don't matter: the
// list shows 1, 2, 3 in order, whatever numbers Claude wrote.
export const LIST_ITEM = /^\s*(\d{1,2})[.)]\s+/;
export const startsNewList = (number, currentList) => !currentList || number === 1;

// The numbered lists in a response's text. Each item's name is the text before its first colon.
export function findLists(text) {
  const lists = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const item = line.match(LIST_ITEM);
    if (!item) {
      current = null;
      continue;
    }
    if (startsNewList(Number(item[1]), current)) lists.push((current = []));
    const body = line.slice(item[0].length).trim();
    const colon = body.indexOf(':');
    current.push({ name: (colon > 0 ? body.slice(0, colon) : body).trim() });
  }
  return lists;
}

// Decides what a follow-up does, given the lists the reader can see in the latest response.
// - normal: no position, or no list. The question goes to Claude with the chat history.
// - resolved: 1 list and the position is in range. Code knows the item.
// - clarify (GA-5c): 2 or more lists, or the position is out of range. Ask which one, using the latest list.
//   The question is CLARIFY_QUESTION for 2 or more lists, and names the count when out of range.
export function decideFollowUp(question, lists) {
  const found = findPosition(question);
  if (!found || lists.length === 0) return { kind: 'normal' };
  const list = lists.at(-1);
  const position = found.last ? list.length : found.position;
  const items = list.map((item) => item.name);
  if (lists.length > 1) return { kind: 'clarify', question: CLARIFY_QUESTION, items };
  if (position < 1 || position > list.length) {
    return { kind: 'clarify', question: outOfRangeQuestion(list.length), items };
  }
  const name = list[position - 1].name;
  return { kind: 'resolved', resolved: { position, name, opening: `${found.phrase}, ${name}: ` } };
}

// A GA-5c pick: code already knows the item. The opening matches the question "Which option do you mean?".
export function resolvePick(items, index) {
  const name = items[index];
  return { position: index + 1, name, opening: `Option ${index + 1}, ${name}: ` };
}

export const NO_ANSWER_MARKER = '[NO_ANSWER]';

// GA-4: Claude starts its response with the marker on its own first line when the docs don't answer the question.
// The first line is held back until code knows whether it is the marker, so the marker never shows.
// Returns { blocks, noAnswer }: the turn's text blocks in order, without the marker or anything still held back.
// A stop or error before the marker line is complete counts as no marker, and the held-back text stays hidden.
export function readTurn(turn) {
  const blocks = Object.keys(turn.blocks)
    .sort((a, b) => a - b)
    .map((index) => turn.blocks[index]);
  const text = blocks.map((block) => block.text).join('');
  const start = text.trimStart();
  const leading = text.length - start.length;

  if (start.startsWith(NO_ANSWER_MARKER)) {
    const rest = text.slice(leading + NO_ANSWER_MARKER.length);
    if (turn.status === 'complete' || /\S|\n/.test(rest)) {
      const cut = text.length - rest.trimStart().length;
      return { blocks: dropCharacters(blocks, cut), noAnswer: true };
    }
    return { blocks: dropCharacters(blocks, text.length), noAnswer: false };
  }
  // Could still become the marker: nothing has ruled it out yet. A finished response has nothing more to come.
  if (NO_ANSWER_MARKER.startsWith(start) && turn.status !== 'complete') {
    return { blocks: dropCharacters(blocks, text.length), noAnswer: false };
  }
  return { blocks, noAnswer: false };
}

// Removes the first `count` characters from the blocks, which can span more than one block.
function dropCharacters(blocks, count) {
  let remaining = count;
  return blocks.map((block) => {
    const cut = Math.min(remaining, block.text.length);
    remaining -= cut;
    return { ...block, text: block.text.slice(cut) };
  });
}

// The text a turn's response shows, in order: the code-written opening, then the streamed text.
// Used for the copy button and for the history sent to Claude on the next turn.
export function turnText(turn) {
  if (turn.kind === 'clarify') return turn.clarifyQuestion;
  const streamed = readTurn(turn)
    .blocks.map((block) => block.text)
    .join('');
  return `${turn.resolved?.opening ?? ''}${streamed}`.trim();
}

// The lists a position refers to: the latest response in the chat that has a numbered list (a GA-5c turn's
// options count). A newer response with its own list wins. Responses without a list are skipped, so after
// F1 (list) and the DSSE-KMS answer (no list), "the second one" still means F1's list.
export function visibleLists(turns) {
  for (const turn of [...turns].reverse()) {
    if (turn.kind === 'clarify') return [turn.items.map((name) => ({ name }))];
    // Error turns count too: they keep their partial text on screen.
    if (!['complete', 'stopped', 'error'].includes(turn.status)) continue;
    const lists = findLists(turnText(turn));
    if (lists.length > 0) return lists;
  }
  return [];
}

// Earlier turns as { question, answer } for Claude. Turns with no response text are left out.
export function chatHistory(turns) {
  return turns
    .map((turn) => ({ question: turn.question, answer: turnText(turn) }))
    .filter((turn) => turn.answer);
}
