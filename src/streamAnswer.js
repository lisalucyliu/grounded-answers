// Calls /api/answer and passes each newline-delimited JSON event to onEvent.
// Pass an AbortSignal to cancel. Cancelling closes the connection, which is
// what tells the server to stop the Claude stream.
export async function streamAnswer(question, { signal, onEvent }) {
  const response = await fetch('/api/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
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
