import { stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// DEV ONLY. Serves /api/answer from api/answer.js inside the Vite dev server.
//
// Why: under `vercel dev`, the local proxy keeps reading a function's response
// after the browser disconnects, so the function never learns about a stop.
// Deployed Vercel functions do learn about it: with "supportsCancellation" in
// vercel.json, Vercel fires request.signal when the client disconnects.
//
// This route SIMULATES that Vercel behavior locally. It fires request.signal
// when the browser hangs up. It is not the real Vercel path. `apply: 'serve'`
// keeps it out of `vite build`, so it never ships.
const handlerFile = fileURLToPath(new URL('../api/answer.js', import.meta.url));

async function loadHandler() {
  // Re-import when the file changes, so edits take effect without a restart.
  const { mtimeMs } = await stat(handlerFile);
  return import(`${pathToFileURL(handlerFile).href}?t=${mtimeMs}`);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default function apiDevRoute() {
  return {
    name: 'grounded-answers-api-dev-route',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/answer', async (req, res) => {
        const disconnect = new AbortController();
        res.on('close', () => {
          if (!res.writableEnded) disconnect.abort(); // Browser hung up before the response finished.
        });

        try {
          const { POST } = await loadHandler();
          if (req.method !== 'POST') {
            res.statusCode = 405;
            return res.end();
          }
          const request = new Request(`http://localhost${req.originalUrl}`, {
            method: 'POST',
            headers: req.headers,
            body: await readBody(req),
            signal: disconnect.signal,
          });
          const response = await POST(request);

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (!response.body) return res.end();

          const reader = response.body.getReader();
          // Let request.signal reach the handler first (that's the Vercel behavior
          // we're simulating), then release the reader.
          disconnect.signal.addEventListener('abort', () => setTimeout(() => reader.cancel().catch(() => {})));
          while (true) {
            const { done, value } = await reader.read();
            if (done || disconnect.signal.aborted) break;
            res.write(value);
          }
          res.end();
        } catch (error) {
          if (disconnect.signal.aborted) return;
          console.error('[dev api] request failed:', error);
          if (!res.headersSent) res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}
