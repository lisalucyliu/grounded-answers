# Grounded Answers

A redesign of AWS Docs AI, the AI answer feature on docs.aws.amazon.com. This repo builds it one component at a time. Component 1 is a streaming response with a stop control.

## Design mode

**System (Cloudscape).** Use only Cloudscape components and patterns (`@cloudscape-design/components`, `@cloudscape-design/chat-components`). Colors and spacing come from Cloudscape components or `@cloudscape-design/design-tokens`. No hardcoded colors, spacing or fonts.

- Before using any Cloudscape component, check its page on cloudscape.design for current props and guidelines. The markdown versions are listed at https://cloudscape.design/llms.txt.
- If nothing in Cloudscape fits a part, stop and tell Lisa, with up to 3 options.
- No style changes from Cloudscape without Lisa's OK. Approved so far:
  - The user's question bubble uses `type="outgoing"` with `style.bubble.background = colorBackgroundChatBubbleIncoming`, so it's gray like the current AWS Docs AI.
  - No AI bubble or avatar. The response stays plain text, as in the current AWS Docs AI layout.
  - Regenerate shows only on a stopped response, only one time.
  - [n] opens a popover for that source.
  - Below 688px, Panel layout shows the Sources panel alone, in place of the chat. Nothing extra is built for this.
  - For a 0-cited answer, the panel keeps the "Cited in this answer (0)" heading, with no list.
  - Rail container: no outline, gray shadow (`style.root.borderColor: 'transparent'`, `boxShadow: shadowContainerActive`, the only gray shadow token; `shadowCard` is "none"). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26). Known gap: `shadowContainerActive` starts with a 1px ring (`0px 1px 1px 1px`), which shows as a thin light line. No exported token has only the soft shadow; this is waiting on Lisa.
  - Rail size: runs from below the tabs to the bottom of the viewport (`height` from `--ga-main-top`, Container `fitHeight`, `spaceScaledL` below). About 46px wide (Container `style.content.paddingInline: spaceStaticXs`). Icon buttons are 28px circles (`style.root` padding `spaceStaticXxxs` / `spaceStaticXxs`, `borderRadiusButton`), about 61px apart. AWS's circle is about 32px; no spacing token pair makes an exact 32px square around Cloudscape's 16x20 icon box. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26, and `design/aws-rail-settings-open.png`, `design/aws-rail-settings-closed.png`).
  - Rail dividers: a thin line between each pair of icons (`borderWidthLayoutSideNavigation`, `colorBorderDividerDefault`), as wide as the rail content. `aria-hidden`, decoration only. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26, and `design/aws-rail-settings-open.png`, `design/aws-rail-settings-closed.png`).
  - Rail Sources button, open state: a blue circle with a white filled quote icon, like the AWS Settings button. It's an icon Button styled through Button's style API (`colorBackgroundButtonPrimaryDefault`, `…Hover`, `…Active`; `colorTextButtonPrimaryDefault`, `…Hover`, `…Active`), not a Toggle button, because Toggle button has no style API. `nativeButtonAttributes` adds `aria-pressed`, so screen readers still hear the pressed state. Tooltip and name: "Sources". Measured open: background `rgb(0, 108, 224)`, hover `rgb(0, 43, 102)`, icon white. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26, and `design/aws-rail-settings-open.png`, `design/aws-rail-settings-closed.png`).
  - Prompt input: no outline, gray shadow (`style.root.borderColor` transparent and `boxShadow: shadowContainerActive` for default and hover). The focus state keeps Cloudscape's own focus border. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Sources panel: no Container box. A plain panel with one divider on its right edge (`borderWidthLayoutSideNavigation` and `colorBorderDividerDefault`). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Prompt input shadow shows on all sides: Panel layout clips its content area, so the chat column has `spaceScaledXl` padding on both sides (also the gap next to the panel's divider). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "View all sources (n)": a normal Button (outlined), centered under the Sources list, to match the live AWS Docs AI. Replaces the earlier `variant="link"` choice. Source: Lisa's GA-2c frame and screenshots, Oct 26.
  - Every external link in the source lists has its own external icon (`external` with `externalIconAriaLabel="Opens in a new tab"`): the list under the response, "Cited in this answer" and "Also read, not cited". No icon on the headings. Replaces the "Links open in a new tab" label. Cloudscape Link guidelines put one icon on a list heading instead. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Panel close control: the caret icon `angle-left` at the top right next to the title, accessible name "Close sources". Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "For: <question>": a text line (not a heading) in Box `fontSize="heading-xs"` and `fontWeight="bold"`. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "Cited in this answer (n)": an h3 in Box `fontSize="heading-xs"` and `fontWeight="bold"`, the same size and weight as the "Also read, not cited (n)" Expandable section header (16px bold). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Sources is an always-open heading and list under the response.
- Ask before adding anything that isn't in the request.

## Designs

- `design/GA-1a.png`: generating. `design/GA-1b.png`: stopped. Use these PNGs. Don't call Figma MCP tools for these frames.
- The PNGs are screenshots of the live AWS Docs site, so they stay on disk only. `design/*.png` is in `.gitignore`. Never commit them.
- The frames are mostly pasted screenshots. Sticky notes and annotations are notes, not UI.
- `design/icon-sources-cloudscape.svg`: Lisa's custom Sources icon, used in the left rail.

## Layout (keep the current AWS Docs AI layout)

- Top navigation: plain text title "Docs prototype". No AWS logo, and never "AWS Documentation". The search input shows the current question.
- Tabs: "Docs AI" (active) and "All results" (disabled for now).
- Left icon rail: edit, download, sources, settings. All inert until their features are built.
- The user's question is a bubble on the right. The response is plain text on the left. No avatars and no AI bubble.
- The prompt input is pinned at the bottom of the viewport. Only the conversation scrolls. New text stays in view unless the reader scrolls up.
- Below 688px (Cloudscape's "s" breakpoint) the left rail is hidden. Not yet confirmed by Lisa.

## Component 1 behavior

1. **Send.** While generating, show "Generating a response" (no ellipsis, no end period). The prompt placeholder is "Waiting for response..." (Lisa's copy, kept on purpose even though Cloudscape avoids ellipses in placeholders). The action button becomes a stop button.
2. **Stream.** Text appears as it arrives from the Claude API stream.
3. **Stop.** The browser cancels the request, and the server aborts the Claude stream so no one pays for unseen text. The server side is in `api/answer.js`, in the block marked `SERVER STOP`.
4. **Stopped state.** Partial text stays. Below it: Status indicator "Stopped. This response is not complete.", then Sources, then the button group (thumbs up, thumbs down, divider, regenerate, copy). Regenerate shows only on a stopped response, only one time, and asks the same question again.
5. **Complete state.** The same button group without regenerate.
6. **Sources.** Uses Claude API citations with `search_result` blocks. One search result per doc section, one text block per paragraph. Sources are numbered per section URL, in order of first citation. Inline `[n]` popover triggers follow the text each citation supports. After a stop, only sources cited in the partial text are listed. Title format: "page title · guide name › section". The "› section" part only shows when it differs from the page title.
7. **Error after partial text.** Partial text stays. A Cloudscape error Alert says "Something went wrong and the response didn't finish. Your question is saved." with "Try again" in the action slot. No button group.

## GA-2: Sources panel and citation popovers

Every question sends all 25 sections. At stream start the server sends one `sections` event (id, url, pageTitle, guideName, sectionHeading for each section it sent). For each response, "cited" = sections with a citation in the text that arrived. "Also read, not cited" = every other section that was sent.

1. **Under the response.** The "Sources" heading and up to 5 cited sources, numbered by first citation. Then "View all sources (n)", a normal Button centered under the list (it opens a panel, so it's an action, not navigation). n = cited + also read = 25. With 0 cited (stopped or complete), only the button shows, with no heading. Error state is unchanged from GA-1: all cited sources and no button.
2. **[n] popover.** Cloudscape Popover with a text trigger, wrapped in `Box color="text-status-info"` so [n] keeps the link color (dashed underline, per Cloudscape's text trigger). Size medium. Header: page title. Content: guide name, the section name when it differs from the page title, and an "Open section" external link to the section URL. Dismiss button. `renderWithPortal` so the conversation's scroll area doesn't clip it. The live AWS Docs AI [n] markers use a dashed underline in link blue (source: Lisa's screenshot, Oct 26).
3. **Sources panel.** Cloudscape Panel layout (`panelPosition="side-start"`, 360px), so the panel sits between the rail and the chat and pushes the chat. The panel is plain, with a divider on its right edge: title "Sources" with an `angle-left` close button, "For: <question>", "Cited in this answer (n)" with the same [n] numbers in number order, then "Also read, not cited (n)" as an Expandable section, closed by default, in `data/docs.json` order. Every row is the source title as a link with its own external icon that opens in a new tab.
4. **Which turn.** "View all sources (n)" opens the turn it belongs to. The rail Sources icon (an icon Button with `aria-pressed`, Lisa's outline icon, and her filled icon `design/icon-sources-cloudscape-filled.svg` on a blue circle when open) opens the latest complete or stopped turn. Before any such turn, the rail icon does nothing. The panel shows its turn live and stays on that turn while a new response generates. If its own turn starts to regenerate (Regenerate or Try again), the panel closes and returns focus as on a normal close. If the opener is gone ("View all sources" on that turn), focus goes to the prompt input.

## Accessibility

- The stop button's accessible label and tooltip are both "Stop generation". It's a one-item Button group in the Prompt input's `customPrimaryAction` slot, because the built-in action button has no tooltip.
- After a stop, keyboard focus moves to the prompt input.
- A polite live region announces "Stopped. This response is not complete." one time per stop.
- The same live region also announces the finished response text and the error message. Cloudscape's Gen AI chat pattern says to announce each new message. This was added during the design review.
- Source links say "Opens in a new tab" to screen readers. Every external link, in the lists and in the popover, uses `external` with `externalIconAriaLabel="Opens in a new tab"`.
- Each [n] popover trigger is named "Source n".
- The Sources panel moves focus to its title when it opens. The `angle-left` close button ("Close sources") and Escape close it and return focus to the control that opened it.

## Stack

- React + Vite, plain JavaScript.
- One Vercel function, `api/answer.js`, streams newline-delimited JSON to the browser.
- Model: `claude-sonnet-5-5` (current Claude Sonnet, checked in the Claude API models overview). Effort is set to `low`. Always check the model ID in the docs, never guess it.
- Vercel project: `grounded-answers`. Never link this folder to another Vercel project.

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
- `tests/sources.spec.js`: GA-2 checks, free. Run `npx playwright test tests/sources.spec.js` with `npm run dev` running. It uses the fake answer, never Claude.
- The fake answer lives in `tests/fakeAnswer.js`. `useFakeAnswer(page, [...])` adds a script to the Playwright test browser that replaces `fetch` for `/api/answer` only, and plays back the real 25-section `sections` event plus 6 cited sentences from a real F4 answer. Per request it can be `full`, `uncited` (no citations) or `hold` (2 cited sentences, then waits for Stop). Like `FORCE_ERROR`, it can't run in production: it exists only inside Playwright's test browser, and nothing in the app or server code reads it.
- Playwright can't prove what a screen reader says. Lisa checks the live region with VoiceOver by hand.

## Open checks

- [ ] **Real Vercel stop path.** After the first deploy, stop 3 responses on the live site and check the Vercel function logs for `[answer] stream stopped`. The local result comes from the dev-only simulation, so this hasn't been proven on Vercel yet.
- [ ] **VoiceOver.** Confirm the live region announces "Stopped. This response is not complete." once per stop.

## Open design decisions (from the design review on 2026-10-26)

These follow Lisa's spec, or weren't in the request, so they wait for her. Each needs either approval (then add it to "Approved so far") or a spec change.
- **Empty state.** The page before the first question is a blank area with the prompt input. Cloudscape offers support prompts for suggested questions.
- **Thumbs down.** It only toggles. Cloudscape opens a dialog to collect more feedback.
- **Sources panel, all sources cited.** "Also read, not cited (0)" would be an empty expandable section. Copy, or hiding the group, is Lisa's call.
- **Sources under the answer.** Still a heading and list. Cloudscape's Gen AI chat pattern uses an expandable section titled "Sources", with source details in description text size.
- **Smaller items.** The rail hides on phone. Thumbs up and down still show when a stop happened before any text. Response lines run about 1290px wide at 1440, and Cloudscape suggests constraining width. The rail Sources icon gives no feedback before the first answer (a disabled state with a reason is an option).

## Parking lot

Known, not urgent. Revisit later.
- **Chat width at 768px with the panel open.** The 360px panel leaves about 250px for the conversation. Options: a smaller panel, a resizable panel, or the narrow layout at tablet.

## Doc data

`data/docs.json` holds 25 sections from live AWS docs pages: Amazon S3 encryption, versioning and replication, one S3 cost example, AWS Data Exchange export and data grant pages, and the Request Syntax for TagResource in the Data Exchange and S3 Control API references. Each section has the page title, guide name, section heading, URL and paragraphs. Use only text from the live pages, word for word.

- Subsection sources carry their #anchor. Page intros use the plain page URL.
- The sections were picked with the questions in `evals/questions.md` in view. 19 hold answers. The cost example section is there for N1: it has a price but names no Region.
- These 6 sections hold no answer to any eval question, so Claude has to choose what to cite: `UsingKMSEncryption-bucket-keys`, `s3-batch-replication-completion-report`, `replication-kms-sse-c`, `dx-revision-export-keypatterns`, `dx-auto-export` and `dx-auto-export-console`.
- Rebuild with `python3 scripts/extract_docs.py <folder for page HTML>`. The section list lives in the script.
- Each question sends about 30,000 input tokens (about $0.07 per question with output). No prompt caching or search for now.

## Writing rules

These apply to UI copy, docs and commit messages.
- No em dashes.
- No "it's not X, it's Y."
- No inflated words, no rule-of-three lists, no summary sentences that repeat what was just said.
- Write plainly.
