# Grounded Answers

A redesign of AWS Docs AI, the AI answer feature on docs.aws.amazon.com. This repo builds it one component at a time. Component 1 is a streaming response with a stop control.

## Design mode

**System (Cloudscape).** Use only Cloudscape components and patterns (`@cloudscape-design/components`, `@cloudscape-design/chat-components`). Colors and spacing come from Cloudscape components or `@cloudscape-design/design-tokens`. No hardcoded colors, spacing or fonts.

- Before using any Cloudscape component, check its page on cloudscape.design for current props and guidelines. The markdown versions are listed at https://cloudscape.design/llms.txt.
- If nothing in Cloudscape fits a part, stop and tell Lisa, with up to 3 options.
- No style changes from Cloudscape without Lisa's OK. Approved so far:
  - The user's question bubble uses `type="outgoing"` with `style.bubble.background = colorBackgroundChatBubbleIncoming`, so it's gray like the current AWS Docs AI.
- Ask before adding anything that isn't in the request.

## Designs

- `design/GA-1a.png`: generating. `design/GA-1b.png`: stopped. Use these PNGs. Don't call Figma MCP tools for these frames.
- The PNGs are screenshots of the live AWS Docs site, so they stay on disk only. `design/*.png` is in `.gitignore`. Never commit them.
- The frames are mostly pasted screenshots. Sticky notes and annotations are notes, not UI.
- `design/icon-sources-cloudscape.svg`: Lisa's custom Sources icon, used in the left rail.

## Layout (keep the current AWS Docs AI layout)

- Top navigation: plain text title "Docs prototype". No AWS logo, and never "AWS Documentation". The search input shows the current question.
- Tabs: "Docs AI" (active) and "All results" (disabled for now).
- Left icon rail: edit, download, settings, sources. All inert until their features are built.
- The user's question is a bubble on the right. The response is plain text on the left. No avatars and no AI bubble.
- The prompt input is pinned at the bottom of the viewport. Only the conversation scrolls. New text stays in view unless the reader scrolls up.
- Below 688px (Cloudscape's "s" breakpoint) the left rail is hidden. Not yet confirmed by Lisa.

## Component 1 behavior

1. **Send.** While generating, show "Generating a response" (no ellipsis, no end period). The prompt placeholder is "Waiting for response..." (Lisa's copy, kept on purpose even though Cloudscape avoids ellipses in placeholders). The action button becomes a stop button.
2. **Stream.** Text appears as it arrives from the Claude API stream.
3. **Stop.** The browser cancels the request, and the server aborts the Claude stream so no one pays for unseen text. The server side is in `api/answer.js`, in the block marked `SERVER STOP`.
4. **Stopped state.** Partial text stays. Below it: Status indicator "Stopped. This response is not complete.", then Sources, then the button group (thumbs up, thumbs down, divider, regenerate, copy). Regenerate shows only on a stopped response, only one time, and asks the same question again.
5. **Complete state.** The same button group without regenerate.
6. **Sources.** Uses Claude API citations with `search_result` blocks. One search result per doc section, one text block per paragraph. Sources are numbered per section URL, in order of first citation. Inline `[n]` Cloudscape Links follow the text each citation supports. After a stop, only sources cited in the partial text are listed. Title format: "page title · guide name › section". The "› section" part only shows when it differs from the page title.
7. **Error after partial text.** Partial text stays. A Cloudscape error Alert says "Something went wrong and the response didn't finish. Your question is saved." with "Try again" in the action slot. No button group.

## Accessibility

- The stop button's accessible label and tooltip are both "Stop generation". It's a one-item Button group in the Prompt input's `customPrimaryAction` slot, because the built-in action button has no tooltip.
- After a stop, keyboard focus moves to the prompt input.
- A polite live region announces "Stopped. This response is not complete." one time per stop.
- The same live region also announces the finished response text and the error message. Cloudscape's Gen AI chat pattern says to announce each new message. This was added during the design review.
- Source links say "Opens in a new tab" to screen readers (`externalIconAriaLabel`).

## Stack

- React + Vite, plain JavaScript.
- One Vercel function, `api/answer.js`, streams newline-delimited JSON to the browser.
- Model: `claude-sonnet-5-5` (current Claude Sonnet, checked in the Claude API models overview). Effort is set to `low`. Always check the model ID in the docs, never guess it.
- Vercel project: `grounded-answers`. Never link this folder to `hp-newsroom`.

## Secrets

- The key lives in `ANTHROPIC_API_KEY` in `.env.local`. Lisa pastes it herself. Never print it, read it, or ask for it.
- `.gitignore` covers `.env*`, `.DS_Store`, `node_modules`, `.vercel` and `dist`. Never commit `.env` files.
- `vercel link` and `vercel env pull` rewrite `.env.local`. Warn Lisa before running either.
- `vercel dev` doesn't pass `.env.local` to functions, so `api/answer.js` loads it with `process.loadEnvFile` outside production.

## Running locally

| What | Command (in `~/grounded-answers`) |
| --- | --- |
| App + API, with working stop | `npm run dev`, then open http://localhost:5173 |
| Vercel's own local runtime | `npm run vercel-dev`, then open http://localhost:3000 |

- `npm run dev` serves `/api/answer` through `dev/apiDevRoute.js`, a dev-only Vite route. It **simulates** Vercel's request cancellation by firing `request.signal` when the browser hangs up. It is not the real Vercel path, and it never ships (`apply: 'serve'`).
- Under `vercel dev`, the server stop does **not** work. Its local proxy keeps reading after the browser disconnects, so Claude keeps generating.
- Error-state testing: start the dev server with `FORCE_ERROR=1 npm run dev`. The server then fails after about 400 characters of text. This switch never works in production.
- Restart the dev server after changing `vite.config.js`, `dev/` or `.env.local`.

## Tests

Playwright tests call the real Claude API, so every run costs money. Run only what a check needs.

- `tests/stop.spec.js`: 3 real streams (ask + stop, regenerate + stop, new question + stop). Needs `SERVER_LOG` set to the dev server's log file.
- `tests/error.spec.js`: 1 real stream. Needs the dev server started with `FORCE_ERROR=1`.
- Playwright can't prove what a screen reader says. Lisa checks the live region with VoiceOver by hand.

## Open checks

- [ ] **Real Vercel stop path.** After the first deploy, stop 3 responses on the live site and check the Vercel function logs for `[answer] stream stopped`. The local result comes from the dev-only simulation, so this hasn't been proven on Vercel yet.
- [ ] **VoiceOver.** Confirm the live region announces "Stopped. This response is not complete." once per stop.

## Open design decisions (from the design review on 2026-10-26)

These follow Lisa's spec, or weren't in the request, so they wait for her. Each needs either approval (then add it to "Approved so far") or a spec change.
- **Empty state.** The page before the first question is a blank area with the prompt input. Cloudscape offers support prompts for suggested questions.
- **Thumbs down.** It only toggles. Cloudscape opens a dialog to collect more feedback.
- **No AI bubble or avatar.** The response is plain text, and loading uses a Status indicator. Cloudscape uses an incoming chat bubble with a generative AI avatar.
- **Sources.** Shown as an always-open "Sources" heading and list. Cloudscape uses an expandable section titled "Sources", and suggests description text size for source details.
- **Inline citations.** `[n]` links jump to the Sources list. Cloudscape uses a popover per citation with the source title.
- **Regenerate.** Only on a stopped response, only once. Cloudscape also allows it on completed responses.
- **Smaller items.** The rail hides on phone. Thumbs up and down still show when a stop happened before any text. Response lines run about 1290px wide at 1440, and Cloudscape suggests constraining width.

## Doc data

`data/docs.json` holds 3 sections from the live Amazon S3 User Guide (encryption overview, SSE-KMS, DSSE-KMS). Each section has the page title, guide name, section heading, section URL with its `#anchor`, and its paragraphs. Use only text from the live pages. The full doc set comes later.

## Writing rules

These apply to UI copy, docs and commit messages.
- No em dashes.
- No "it's not X, it's Y."
- No inflated words, no rule-of-three lists, no summary sentences that repeat what was just said.
- Write plainly.
