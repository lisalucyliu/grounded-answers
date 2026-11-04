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
  - For a 0-cited answer, the panel keeps the "Cited in this answer (0)" heading, with no list (decision 47, updated Nov 2: no "View all sources" button at 0 cited, and the rail icon still opens the panel).
  - Rail container: no outline, gray shadow (`style.root.borderColor: 'transparent'`, `boxShadow: shadowCard`). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Shadow values through the theming API (Lisa, Oct 26, option 1): `src/main.jsx` calls `applyTheme` to set `shadowCard` to the soft part of `shadowContainerActive` only, without its 1px ring: `0px 6px 36px #0007161a` (light) and `0px 6px 36px #00040c` (dark). These are literal values, copied from `node_modules/@cloudscape-design/design-tokens/index-visual-refresh.json`, token `shadow-container-active` (design-tokens 3.0.116, components 3.0.1404). They match the live AWS Docs AI (Lisa's screenshots). `shadowCard` is global: in components 3.0.1404 its default is "none" and only `--shadow-item-card` (Item card) and `--shadow-dialog` (Dialog) read it, and the app uses neither. Checked Oct 27 by comparing the computed box-shadow of every element in 9 views, light and dark: only the rail Container and the Prompt input changed. Measured after: light `rgba(0, 7, 22, 0.1) 0px 6px 36px 0px`, dark `rgb(0, 4, 12) 0px 6px 36px 0px`. Recheck after a Cloudscape upgrade.
  - GA-5c keeps Support prompt group in the chat body, not a docked dialog (Cloudscape's Follow-up questions pattern suggests a dialog for clarifying intent). Reason: decision 26 (Oct 21) rejected the question card and reuses the prompt buttons that Docs AI already uses for Next Steps.
  - GA-5c prompts are bare item names ("SSE-KMS"), not questions. Deviation from Cloudscape ("Phrase prompts as either a full question or a request"). Reason: decision 52. Stacked names are easier to scan, and the user bubble shows the button text.
  - A stopped resolved answer keeps its partial text, even if only the code-written opening shows ("The third one, DSSE-KMS:"). Same rule as GA-1b. The stop status shows and Regenerate stays in the button group.
  - Rail size (decision 63, Lisa, Nov 2): runs from below the tabs to the bottom of the viewport (`height` from `--ga-main-top`, Container `fitHeight`, `spaceScaledL` below). Approved deviation from Cloudscape: Lisa wants the AWS sizes, not the nearest tokens, so literal px values are used where no token gives the size, the same way as the shadowCard exception. Rail 48px wide (Container `style.content.paddingInline: '7px'`, literal, plus the Container's 1px border). Checked against Lisa's DevTools measurement of docs.aws.amazon.com (Nov 2): the live rail is 48px, 40px content plus 4px padding on each side. Lisa's 46px reading here is the content wrapper inside the border. The Container root and the painted surface both measure 48px, light and dark (painted width read from screen pixels with the shadow off), so no size changed. Icon buttons are 32px circles (`style.root` `paddingBlock: spaceStaticXxs`, `paddingInline: '6px'`, literal, `borderRadiusButton`), 65px apart. Dividers 32px. Measured Nov 2 in light and dark, closed and open. Compared every element in 9 views before and after: inside the rail only the sizes above changed. Outside it, the column next to the rail moved 2px right and got 2px narrower, because the rail is 2px wider. No other size, font, padding, shadow or color changed. Source: `design/aws-rail-settings-open.png`, `design/aws-rail-settings-closed.png`.
  - Rail dividers: a thin line between each pair of icons (`borderWidthLayoutSideNavigation`, `colorBorderDividerSecondary`), 1px tall, as wide as the rail content. `aria-hidden`, decoration only. Matches the live AWS Docs AI (source: Lisa's DevTools measurement of docs.aws.amazon.com, Nov 2: 1px tall, `rgb(235, 235, 240)`, `var(--color-border-divider-secondary)`). Measured: light `rgb(235, 235, 240)`, dark `rgb(35, 43, 55)`. Compared every element in 9 views before and after, light and dark: only the 3 divider colors changed.
  - Rail Sources button, open state: a blue circle with a white filled quote icon, like the AWS Settings button. It's an icon Button styled through Button's style API (`colorBackgroundButtonPrimaryDefault`, `…Hover`, `…Active`; `colorTextButtonPrimaryDefault`, `…Hover`, `…Active`), not a Toggle button, because Toggle button has no style API. `nativeButtonAttributes` adds `aria-pressed`, so screen readers still hear the pressed state. Tooltip and name: "Sources". Measured open: background `rgb(0, 108, 224)`, hover `rgb(0, 43, 102)`, icon white. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26, and `design/aws-rail-settings-open.png`, `design/aws-rail-settings-closed.png`).
  - Prompt input: no outline, gray shadow (`style.root.borderColor` transparent and `boxShadow: shadowCard` for default and hover). The focus state keeps Cloudscape's own focus border. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Sources panel: no Container box. A plain panel with one divider on its right edge (`borderWidthLayoutSideNavigation` and `colorBorderDividerDefault`). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Prompt input shadow shows on all sides: Panel layout clips its content area, so the chat column has `spaceScaledXl` padding on both sides (also the gap next to the panel's divider). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "View all sources": a normal Button (outlined), centered under the Sources list, to match the live AWS Docs AI. Replaces the earlier `variant="link"` choice. Source: Lisa's GA-2c frame and screenshots, Oct 26. No count (Lisa, Nov 2): every question sends all 25 sections, so the count was always 25 and read as 25 relevant pages.
  - Every external link in the source lists has its own external icon (`external` with `externalIconAriaLabel="Opens in a new tab"`): the list under the response, "Cited in this answer" and "Also read, not cited". No icon on the headings. Replaces the "Links open in a new tab" label. Cloudscape Link guidelines put one icon on a list heading instead. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Panel close control: the caret icon `angle-left` at the top right next to the title, accessible name "Close sources". Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "For: <question>": a text line (not a heading) in Box `fontSize="heading-xs"` and `fontWeight="bold"`. Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - "Cited in this answer (n)": an h3 in Box `fontSize="heading-xs"` and `fontWeight="bold"`, the same size and weight as the "Also read, not cited (n)" Expandable section header (16px bold). Matches the live AWS Docs AI (source: Lisa's screenshots, Oct 26).
  - Sources is an always-open heading and list under the response.
  - GA-5c prompts hide while a response generates and come back when it is complete, stopped or in error (decision A, Lisa, Nov 2). Focus moves from the picked prompt to the prompt input, since the button goes away. Measured Nov 2: the group is 184px tall, so everything below it moves 196px (group plus gap) when it hides and when it comes back. In a short window the follow-new-text scroll hides most of that. Waiting for Lisa to decide if this needs a change.
  - Out of range question: "There are 4 options. Which one do you mean?" with the real count (decision B, Lisa, Nov 2). "Which option do you mean?" stays for 2 or more lists, and wins if both apply. The prompt group's accessible name always equals the question text. This text is also what the next request's history sends, as the reader saw it.
  - GA-3 uses Badge for a confidence label (decisions 61 and C to F, Lisa, Nov 2), even though Cloudscape says to avoid badges for status. The label is always text, so color isn't the only signal. Red (`color="red"`) and grey (`color="grey"`) are basic Badge colors.
  - Decision 57, GA-5 review items (Lisa, Oct 26): GA-5c keeps Support prompt group in the chat body, not a docked dialog (decision 26). Prompts stay as bare item names, a logged deviation from Cloudscape (decision 52). A pick must not work while a response generates. A stopped resolved answer keeps its partial text, the same as GA-1b.
  - Decision 58, shadow (Lisa, Oct 26): override shadowCard through the Cloudscape theming API with the soft shadow only, to match the live AWS Docs AI. Approved exception to "no hardcoded values". Built in round 3.
  - Decision 62, footer text: keep "Please double check responses". The AWS baseline uses the same text.
  - Decision C, GA-3 popover copy (Lisa, Nov 2): the price comes from the Live Streaming on AWS with Amazon S3 Implementation Guide, not the S3 User Guide, and the example names no Region. Built in round 4.
  - Overview row (Lisa, Nov 2): a custom row, logged as a deviation, because Header has no slot that fits. Header's `counter` takes text only and its `info` slot is meant for Info links. It's SpaceBetween `direction="horizontal" size="xs"` holding Box `variant="h3" tagOverride="h2"` and the "Why?" Popover, with the Badge in a Box span with `margin left xs`. Lisa's GA-3 frame says 10px, but Cloudscape has no 10px space token, so Lisa chose the nearest token: 8px (Nov 2). Measured 8px and 8px, light and dark, at 1440 and 375. The row has a minimum height of `spaceScaledXl` (24px), so the text stays put when the badge arrives (Lisa, Nov 2). The h2 looks like h3 (18px bold), the same size as "Sources", as on the live AWS Docs AI (`baseline/F1.png`).
  - GA-4 Alert copy, a deviation from the AWS baseline (Lisa, Nov 2): "Looking for something else? Search all results on AWS Docs", with no period after the external link (Cloudscape Alert: descriptions ending with an external link icon "should not have a period after it"). AWS says "Use the All results tab for more results." Reason: the All results tab is disabled in this build, so that copy points to a tab that doesn't work.
  - GA-3 (confidence badge) shows only when the response ends, and it never changes after that. Known trade-off: on N1 (S3 storage price), the reader can see the price for a few seconds before the Low badge. Rejected: show the badge when the first flagged source is cited, because then it can change while the response streams (Lisa, Nov 2).
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
7. **Error after partial text.** Partial text stays. A Cloudscape error Alert says "Something went wrong and the response didn't finish. Your question is saved." with "Try again" in the action slot. No button group. Try again hides on every error turn while any response generates and comes back after, the same as the GA-5c prompts (Lisa, Nov 2).

## GA-2: Sources panel and citation popovers

Every question sends all 25 sections. At stream start the server sends one `sections` event (id, url, pageTitle, guideName, sectionHeading for each section it sent). For each response, "cited" = sections with a citation in the text that arrived. "Also read, not cited" = every other section that was sent.

1. **Under the response.** The "Sources" heading and up to 5 cited sources, numbered by first citation. Then "View all sources", a normal Button centered under the list (it opens a panel, so it's an action, not navigation). With 0 cited (stopped or complete), no heading and no button (decision 47, updated Nov 2). The rail Sources icon still opens the panel, and the panel keeps its counts. Error state is unchanged from GA-1: all cited sources and no button.
2. **[n] popover.** Cloudscape Popover with a text trigger, wrapped in `Box color="text-status-info"` so [n] keeps the link color (dashed underline, per Cloudscape's text trigger). Size medium. Header: page title. Content: guide name, the section name when it differs from the page title, and an "Open section" external link to the section URL. Dismiss button. `renderWithPortal` so the conversation's scroll area doesn't clip it. The live AWS Docs AI [n] markers use a dashed underline in link blue (source: Lisa's screenshot, Oct 26).
3. **Sources panel.** Cloudscape Panel layout (`panelPosition="side-start"`, 360px), so the panel sits between the rail and the chat and pushes the chat. The panel is plain, with a divider on its right edge: title "Sources" with an `angle-left` close button, "For: <question>", "Cited in this answer (n)" with the same [n] numbers in number order, then "Also read, not cited (n)" as an Expandable section, closed by default, in `data/docs.json` order. Every row is the source title as a link with its own external icon that opens in a new tab.
4. **Which turn.** "View all sources" opens the turn it belongs to. The rail Sources icon (an icon Button with `aria-pressed`, Lisa's outline icon, and her filled icon `design/icon-sources-cloudscape-filled.svg` on a blue circle when open) opens the latest complete or stopped turn. Before any such turn, the rail icon does nothing. The panel shows its turn live and stays on that turn while a new response generates. If its own turn starts to regenerate (Regenerate or Try again), the panel closes and returns focus as on a normal close. If the opener is gone ("View all sources" on that turn), focus goes to the prompt input.

## GA-5 and GA-5c: follow-ups that name a list item

On AWS Docs AI, "Tell me more about the third one." got the wrong item 0 of 3 times. Here code resolves the item from the list the reader can see, so Claude never guesses.

1. **Chat history.** Each request sends the earlier questions and the response text the reader saw, as Claude messages. The 25 doc sections go once, in the first user message. Turns with no response text are left out. The code-written opening is part of the response: it's in the history and in the copied text.
2. **Numbered lists.** The system prompt asks for a numbered list when an answer lists options or steps, each item starting with its short name and a colon ("3. DSSE-KMS: ..."), and a numbered list for every list (never a dash or bullet). Lines "1. ...", "2. ..." render as an `<ol>` in Cloudscape Text content (Box can't style lists). One numbering rule for the parser and the renderer (`LIST_ITEM` and `startsNewList` in `src/followUp.js`): numbered lines in a row are one list, blank lines between items are fine, a prose line ends the list, and only a line numbered 1 starts a new one. The list always shows 1, 2, 3 in order, whatever numbers Claude wrote, so "the third one" is always the third item on screen. [n] popovers work inside items. Any "- " lines still render as a `<ul>` in Text content, so raw dashes never show. Positions resolve only from numbered lists.
3. **Resolve in code (`src/followUp.js`).** A follow-up has a position only with a pointer word: "the third one", "third option", "3rd item", "number 3", "option 3", "item 3", "the last one" (first to tenth, 1st to 10th, one to ten). A bare "first" doesn't count. **Lookback:** code uses the latest response in the chat that has a numbered list (a GA-5c turn's options count), not only the latest response. After F1 (list) and the DSSE-KMS answer (no list), "the second one" resolves to SSE-KMS from F1. A newer response with its own list wins. Complete, stopped and error turns count (an error turn keeps its partial text on screen); a response that is still generating doesn't.
   - 1 list, position in range: resolved. Loading text "Generating a response about <item>". The request carries the item as a fact, and Claude is told not to repeat which item it is. The system prompt tells Claude to continue the opening as one sentence, starting in lowercase ("The third one, DSSE-KMS: it applies..."), keeping the case of proper nouns and acronyms. The response opens with code text "<reader's wording>, <item>: " ("The third one, DSSE-KMS: ").
   - 2 or more lists: GA-5c, "Which option do you mean?". Out of range: GA-5c, "There are 4 options. Which one do you mean?".
   - No position, or no list: a normal question with history.
   - Prefill isn't used: `claude-sonnet-5-5` returns a 400 for assistant-turn prefills (Claude API docs), so the opening is code text shown before the streamed text.
4. **GA-5c (`src/ClarifyResponse.jsx`).** Code writes it, with no request. The bold question (see step 3), then a Cloudscape Support prompt group (vertical) with one prompt per item of the latest list, in order. No sources, actions or "Next Steps". The live region announces the question once (cleared first, so a second GA-5c question in a row is announced too). The prompt group's accessible name is the question (Support prompt group has `ariaLabel` only, no `ariaLabelledby`). A pick adds a user bubble with the item name and resolves it in code, with the opening "Option n, <item>: ". The prompts stay and can be picked again (Lisa's decision, as on the live AWS Docs AI; Cloudscape's guideline is to hide previous support prompts). They hide while any response generates. A typed answer goes through step 3 against the options.
5. **Prompt caching and cost.** One `cache_control: {type: 'ephemeral'}` breakpoint (5-minute cache) on the last doc section caches the stable prefix: the system prompt and all 25 sections, about 30,000 tokens. The marker doesn't change what Claude receives (Claude API prompt caching docs: caching is a prefix match, and the marker isn't content). Everything after it (question, history, resolved fact) is per request. The server logs `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` and `output_tokens` for each finished stream. Measured Oct 27: F1 wrote 30,027 cache tokens (about $0.084 with output); the follow-up read 30,027 from cache, 792 uncached (about $0.017 with output, versus about $0.071 uncached). Any change to the system prompt or the doc set changes the prefix, so the first request after it writes the cache again.

**The system prompt must be locked before the evals.** Any change to it after that means rerunning them. Changes so far: numbered lists with "name:" items (Oct 26); numbered lists for every list, no dashes or bullets; continue the code-written opening in lowercase (Oct 27); the [NO_ANSWER] marker for GA-4 (Nov 2). Locked Nov 2, 2026 (model claude-sonnet-5-5, effort low). The test "eval lock: the request to Claude has not changed" in `tests/evalLock.spec.js` holds the lock. It compares a SHA-256 of the request and `data/docs.json` with a stored value. Only Lisa approves a new hash, and a new lock means rerunning the evals.

**After the evals, do not change the code that reads Claude's response** (the [NO_ANSWER] marker rule, the GA-3 badge rule, the GA-4 (no answer hand-off) trigger, the Sources rules) without asking Lisa. The eval lock does not cover this code, and a change can change the graded states (Lisa, Nov 2).

## GA-4: no answer found

Decisions 20, 47, 59 and 60. Option 3 of decision 60 (Lisa, Nov 2) added the marker.

1. **Trigger.** The [NO_ANSWER] marker, or a complete response that cites 0 sources. Not on an error response.
2. **Marker.** The system prompt adds: "When the provided documentation does not answer the question, start your response with [NO_ANSWER] on its own first line, then write your normal response. In every other case, never write [NO_ANSWER]." `readTurn` in `src/followUp.js` holds back the start of the text until it can't be the marker, or the marker's line is complete. The marker is never on screen, in the live region, in the copied text or in the history. Stopped before the marker's line is complete counts as no marker, and the held-back text stays hidden.
3. **Layout.** The response text as Claude wrote it, Sources and "View all sources" if it cites any, the normal button group (thumbs up, thumbs down, divider, copy), then a Cloudscape info Alert. No Next Steps and no support prompt group. The confidence badge follows the GA-3 rule, in the Overview heading above the text. With 0 cited, GA-4 only. The 0-cited panel stays as it was (decision 47).
4. **Alert copy.** "Looking for something else? Search all results on AWS Docs", with no end period. "Search all results on AWS Docs" is a primary external Link to the live AWS search, opening in a new tab: `https://docs.aws.amazon.com/search/doc-search.html?searchPath=documentation&searchQuery=<question>&searchTab=all`. The question is encoded with `URLSearchParams` (`allResultsUrl` in `src/streamAnswer.js`): spaces as "+", "?" as "%3F", other characters with normal URL encoding.
5. **Stops and errors.** Stopped after the marker's line is complete: GA-4 shows on the partial text (Lisa, Nov 2). Error after the marker: only the error Alert.
6. **Real runs, Nov 2, with the marker.** N2: marker, cited `dx-auto-export-console` and `dx-revision-export-keypatterns`, GA-4 shows. N4: marker, 0 cited, GA-4 shows. N1: marker, cited `cost-example-1-s3-pricing`, GA-4 shows. That run had no badge under the old rule. The new rule (GA-3, step 3) would show Low with GA-4, checked with a fake answer only, no paid run since. F2: no marker, 3 cited, no GA-4. Before the marker, N2 cited the same kind of nearby sections and GA-4 did not show.

## GA-3: confidence badge

Decisions 61 and C to F.

1. **The flag.** A section in `data/docs.json` can have an optional `caution` with `reason` and `nextStep`. It's a rule for example pages, not for one question. It's set only on `cost-example-1-s3-pricing`. These are our words, not doc text. `scripts/extract_docs.py` keeps them in `CAUTIONS`, so a rebuild doesn't lose them.
2. **Code only (E).** The `sections` event sends `caution` to the browser. `caution` never goes to Claude. Checked Nov 2: the request body to Claude, for 4 test requests, is byte-identical before and after. Same length and same SHA-256, with a stubbed fetch. `tests/confidence.spec.js` keeps checking this.
3. **Rule (`confidence` in `src/streamAnswer.js`).** Complete response: all cited sections flagged = red Badge "Low confidence". Some flagged = grey Badge "Medium confidence". None flagged = no badge. 0 cited = GA-4, no badge. The rule runs on the cited sections whether or not the [NO_ANSWER] marker is there (Lisa, Nov 2, N1, replaces "with the marker, show no badge"): marker and cited flagged sections = the badge and GA-4 together. Marker and 0 cited = GA-4 only.
4. **Stopped (F).** Uses the sections cited so far, the same rule as the Sources list. Stopped with 0 cited: no badge and no Alert. No badge while generating or on an error response. The brief doesn't name the error case, so this is a default for Lisa to confirm.
5. **Placement.** In the Overview heading, at the top of the response, on long answers too. Next to the heading, outside it, a "Why?" Popover text trigger in Box `color="text-status-info"`, same style as the [n] triggers. Medium Popover (310px) with a dismiss button and `renderWithPortal`. Header "Why low confidence" or "Why medium confidence". Body: 1 to 3 reasons from the flags with no repeats, then one next step, from the first flagged source. Sources stay under the answer. The badge appears when the response ends, in the heading's row. The text doesn't move, because the row has a minimum height of `spaceScaledXl` (24px), its height with a badge (Lisa, Nov 2). Measured 0px, light and dark, at 1440 and 375.
6. **What it doesn't catch (D).** The flag was set with the eval questions in view. The badge shows Low on N1 only when N1 cites only the cost example, and it does not catch N5. Real runs Nov 2: N1 cited only the cost example both before and after the marker was added.

## Overview heading

Lisa, Nov 2.

1. **Where.** Code writes "Overview" at the top of every complete response, stopped response with text, resolved follow-up, GA-4, and error turn that kept partial text. Not on GA-5c question turns, or on stops or errors with no text (Lisa, Nov 2). Claude doesn't write it, and it isn't in the copied text or the history.
2. **Level.** h2. The page's h1 is the first question, and "Sources" under the response is an h3, so h2 fills the gap between them and each turn's "Sources" sits under its own Overview. The Sources panel title is also an h2. Looks like h3, as on the live AWS Docs AI, where Overview and Sources are the same size.
3. **Badge.** Inside the h2, so the accessible name is "Overview Low confidence" (measured in Chromium, no comma, since a name comes from the text). "Why?" is outside it, its own button.
4. **While streaming.** It appears as soon as there is text to head (Lisa, Nov 2), so the text doesn't move when the response ends.

## Accessibility

- The stop button's accessible label and tooltip are both "Stop generation". It's a one-item Button group in the Prompt input's `customPrimaryAction` slot, because the built-in action button has no tooltip.
- After a stop, keyboard focus moves to the prompt input.
- A polite live region announces "Stopped. This response is not complete." one time per stop.
- The same live region also announces the finished response text and the error message. Cloudscape's Gen AI chat pattern says to announce each new message. This was added during the design review.
- When a response with a badge finishes, the badge text comes first: "Low confidence. <response text>" or "Medium confidence. <response text>". A stop too (Lisa, Nov 2): "Low confidence. Stopped. This response is not complete." "Overview" isn't announced.
- The error Alert's icon is labeled "Error" (`i18nStrings.errorIconAriaLabel`), the same way the info Alert's icon is labeled "Info". `statusIconAriaLabel` is deprecated and isn't in the live Alert API, so `i18nStrings` it is. "Error" is Cloudscape's own en-GB default for this string.
- Source links say "Opens in a new tab" to screen readers. Every external link, in the lists and in the popover, uses `external` with `externalIconAriaLabel="Opens in a new tab"`.
- Each [n] popover trigger is named "Source n".
- After a GA-5c pick, keyboard focus moves to the prompt input, since the prompts hide.
- The Sources panel moves focus to its title when it opens. The `angle-left` close button ("Close sources") and Escape close it and return focus to the control that opened it.

## Stack

- React + Vite, plain JavaScript.
- One Vercel function, `api/answer.js`, streams newline-delimited JSON to the browser.
- Model: `claude-sonnet-5-5` (current Claude Sonnet, checked in the Claude API models overview). Effort is set to `low`. Effort test, Nov 2: Lisa kept low, because medium was not better on N1, N2 or F1. Results: `evals/runs/2026-11-02-effort/`. Always check the model ID in the docs, never guess it.
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
- `tests/followups.spec.js`: GA-5 and GA-5c checks, free: parsing, numbered list rendering, "the third one", out of range and its copy, a pick, a typed answer, 2 lists, no list, and prompts hiding and coming back. Uses the fake answer.
- `tests/confidence.spec.js`: GA-4 and GA-3 checks, free: the Alert and its encoded link, Low, Medium, none, stopped, the Why? popover, and caution missing from the browser request and the Claude request (stubbed fetch, nothing leaves the machine).
- `tests/noAnswerMarker.spec.js`: GA-4 marker checks, free: the hold-back rule, never on screen, not copied, not in history, GA-4 with cited sources, the badge and GA-4 together, GA-4 only at 0 cited, and stops and errors around the marker line.
- `tests/overview.spec.js`: Overview heading, announcement and Try again checks, free: each turn type, badge inside the heading, the accessible name, 8px gaps, the announced text, and Try again hiding.
- `tests/evalLock.spec.js`: the lock on the eval request, free. If it fails, revert the change or ask Lisa.
- `tests/evalRunner.spec.js`: eval runner checks, free: same request as the app, the saved fields, stopping at a failure, and the runner's results against the real page.
- `scripts/run_evals.js`: runs eval questions on real Claude and saves them in `evals/runs/<date>-<label>/`, with `compare.md`. Every run costs money. Example: `node scripts/run_evals.js --ids N1,N2,F1 --label name`. It stops at the first failure and doesn't retry.
- `tests/sources.spec.js`: GA-2 checks, free. Run `npx playwright test tests/sources.spec.js` with `npm run dev` running. It uses the fake answer, never Claude.
- The fake answer lives in `tests/fakeAnswer.js`. `useFakeAnswer(page, [...])` adds a script to the Playwright test browser that replaces `fetch` for `/api/answer` only, and plays back the real 25-section `sections` event plus 6 cited sentences from a real F4 answer. Per request it can be `full`, `uncited` (no citations) or `hold` (2 cited sentences, then waits for Stop). Like `FORCE_ERROR`, it can't run in production: it exists only inside Playwright's test browser, and nothing in the app or server code reads it.
- Playwright can't prove what a screen reader says. Lisa checks the live region with VoiceOver by hand.

## Open checks

- [x] **Real Vercel stop path.** Proven on Nov 2: 4 stops on the live site each logged `[answer] stream stopped: client disconnected` in the Vercel function logs (decision 82).
- [ ] **VoiceOver.** Lisa's hand pass:
  - [ ] The live region announces "Stopped. This response is not complete." once per stop.
  - [ ] The GA-4 Alert: is it announced when it appears? The live region reads the response text, not the Alert.
  - [ ] Repeated names across turns: every "Why?" and every "View all sources" has the same name.
  - [ ] The pause in "Overview Low confidence": the name has no comma, so listen for whether the two parts run together.
  - [ ] Two GA-5c groups in one chat with the same accessible name.

## Open design decisions (from the design review on 2026-10-26)

These follow Lisa's spec, or weren't in the request, so they wait for her. Each needs either approval (then add it to "Approved so far") or a spec change.
- **Empty state.** The page before the first question is a blank area with the prompt input. Cloudscape offers support prompts for suggested questions.
- **Thumbs down.** It only toggles. Cloudscape opens a dialog to collect more feedback.
- **Sources panel, all sources cited.** "Also read, not cited (0)" would be an empty expandable section. Copy, or hiding the group, is Lisa's call.
- **Sources under the answer.** Still a heading and list. Cloudscape's Gen AI chat pattern uses an expandable section titled "Sources", with source details in description text size.
- **Smaller items.** The rail hides on phone. Thumbs up and down still show when a stop happened before any text. Response lines run about 1290px wide at 1440, and Cloudscape suggests constraining width. The rail Sources icon gives no feedback before the first answer (a disabled state with a reason is an option).

## Decisions logged only through rules

Decisions 59, 60 and 61 are logged only through the GA-4 and GA-3 rules above.

## Parking lot

Known, not urgent. Revisit later.
- **Chat width at 768px with the panel open.** The 360px panel leaves about 250px for the conversation. Options: a smaller panel, a resizable panel, or the narrow layout at tablet.
- **LiveRegion `reannounce()`.** The public LiveRegion has no ref and no functions (installed `live-region/interfaces.d.ts` and the cloudscape.design API, checked Oct 27). `reannounce()` is internal only, so the GA-5c repeat announcement keeps its clear-then-set approach.
- **Footer "Please double check".** Cloudscape writing guidelines avoid "please". The live AWS Docs AI footer has the same text ("Ask Docs is AI and can make mistakes. Please double check responses. By chatting, you agree to this disclaimer.", AWS baseline, `baseline/F1.png`), so it stays (decision 62).
- **Stop status at 375px.** The stop status breaks mid-word at 375px. It follows a Cloudscape text rule (decision 49).
- **Two GA-5c groups in one chat.** They can have the same accessible name. On the VoiceOver checklist in Open checks.
- **0-cited response on narrow screens.** Below 688px, a 0-cited response has no way to reach Sources: the button is gone and the rail is hidden. Parked with decision 49.
- **Badge row with the panel open at 768px.** The chat is about 228px wide there. How "Overview", the badge and "Why?" wrap is not checked yet.
- **Next Steps.** Next Steps were left out of the build. AWS Docs AI shows Next Steps (suggested questions) under normal responses, and Lisa's Oct 21 decision kept them, but the build never added them. Adding them would change the system prompt and the eval lock. The case study must say they were left out (Lisa, Nov 2).
- **More than 5 GA-5c prompts.** Cloudscape: "Don't display more than five support prompts at a time." A list of 6 to 10 items breaks that. F1 has 4.
- **GA-4 false alarm on N3 (export to Google Cloud).** In the Nov 3 eval, Claude started with [NO_ANSWER] on a question the docs answer ("No", exports go to S3 or a signed URL), so GA-4 showed and the answer hedged. One run. Likely cause, not proven: the marker reads "the docs don't mention Google Cloud" as "the docs don't answer". A fix changes the system prompt and the eval lock, so all evals must run again (Lisa, Nov 3).

## Doc data

`data/docs.json` holds 25 sections from live AWS docs pages: Amazon S3 encryption, versioning and replication, one S3 cost example, AWS Data Exchange export and data grant pages, and the Request Syntax for TagResource in the Data Exchange and S3 Control API references. Each section has the page title, guide name, section heading, URL and paragraphs. Use only text from the live pages, word for word. The one exception is the optional `caution` field (see GA-3), which is our own wording and never goes to Claude.

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
