import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ButtonGroup from '@cloudscape-design/components/button-group';
import Link from '@cloudscape-design/components/link';
import Popover from '@cloudscape-design/components/popover';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import TextContent from '@cloudscape-design/components/text-content';
import { useEffect, useRef, useState } from 'react';
import { turnText } from './followUp.js';
import { collectSources, splitSources } from './streamAnswer.js';

export const STOPPED_MESSAGE = 'Stopped. This response is not complete.';
export const ERROR_MESSAGE = "Something went wrong and the response didn't finish. Your question is saved.";

// The list under the response shows this many cited sources. "View all sources" opens the rest in the panel.
const SOURCES_SHOWN = 5;

// An inline [n] that opens a popover with the source's details.
// Text trigger in the link color. Popover's development guidelines: text triggers take the color of a wrapping Box.
function CitationMarker({ number, url, section, fallbackTitle }) {
  return (
    <Box variant="span" color="text-status-info">
      <Popover
        triggerType="text"
        triggerAriaLabel={`Source ${number}`}
        header={section?.pageTitle ?? fallbackTitle}
        size="medium"
        dismissButton
        dismissAriaLabel="Close"
        renderWithPortal
        content={
          <SpaceBetween size="xs">
            {section && <Box color="text-body-secondary">{section.guideName}</Box>}
            {section && section.sectionHeading !== section.pageTitle && <Box>{section.sectionHeading}</Box>}
            <Link href={url} external externalIconAriaLabel="Opens in a new tab" variant="primary">
              Open section
            </Link>
          </SpaceBetween>
        }
      >
        [{number}]
      </Popover>
    </Box>
  );
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
function buildContent(blocks, markersByBlock, sources, sectionsByUrl, opening) {
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
      const source = sources[number - 1];
      lastWithText.pieces.push(
        <span key={`marker-${blockIndex}-${number}`}>
          {' '}
          <CitationMarker
            number={number}
            url={source.url}
            section={sectionsByUrl.get(source.url)}
            fallbackTitle={source.title}
          />
        </span>
      );
    }
  });

  // Lines "1. ...", "2. ..." become one numbered list (blank lines between items are fine).
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
    const item = text.match(/^\s*(\d{1,2})[.)]\s+/);
    const bullet = text.match(/^\s*[-•]\s+/);
    if (bullet) {
      if (!list || list.type !== 'ul') {
        list = { type: 'ul', items: [] };
        segments.push(list);
      }
      list.items.push(stripPrefix(pieces, bullet[0].length));
      paragraph = null;
    } else if (item) {
      const number = Number(item[1]);
      if (!list || list.type !== 'ol' || number !== list.start + list.items.length) {
        list = { type: 'ol', start: number, items: [] };
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

export default function Response({ turn, canRegenerate, onRegenerate, onTryAgain, onViewAllSources }) {
  const [feedback, setFeedback] = useState(null);
  const errorRef = useRef(null);
  const viewAllRef = useRef(null);

  // Bring a new error into view so it isn't hidden below the fold or behind the prompt input.
  useEffect(() => {
    if (turn.status === 'error') errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turn.status]);
  const blocks = Object.keys(turn.blocks)
    .sort((a, b) => a - b)
    .map((index) => turn.blocks[index]);
  const sections = turn.sections ?? [];
  const sectionsByUrl = new Map(sections.map((section) => [section.url, section]));
  const { sources, markersByBlock } = collectSources(blocks);
  const segments = buildContent(blocks, markersByBlock, sources, sectionsByUrl, turn.resolved?.opening);
  const { cited, alsoRead } = splitSources(blocks, sections);
  const sourceCount = cited.length + alsoRead.length;
  const plainText = turnText(turn); // Includes the code-written opening of a GA-5 answer.
  const isGenerating = turn.status === 'loading' || turn.status === 'streaming';
  const showActions = turn.status === 'stopped' || turn.status === 'complete';

  return (
    <div data-testid="response">
      <SpaceBetween size="m">
        {segments.length > 0 && (
          <div data-testid="response-text">
            {segments.map((segment, index) =>
              segment.type === 'p' ? (
                <Box variant="p" key={index}>
                  {segment.pieces}
                </Box>
              ) : (
                // Cloudscape Text content styles lists (Box can't).
                <TextContent key={index}>
                  {segment.type === 'ol' ? (
                    <ol start={segment.start}>
                      {segment.items.map((pieces, itemIndex) => (
                        <li key={itemIndex}>{pieces}</li>
                      ))}
                    </ol>
                  ) : (
                    <ul>
                      {segment.items.map((pieces, itemIndex) => (
                        <li key={itemIndex}>{pieces}</li>
                      ))}
                    </ul>
                  )}
                </TextContent>
              )
            )}
          </div>
        )}

        {isGenerating && (
          <StatusIndicator type="loading">
            {turn.resolved ? `Generating a response about ${turn.resolved.name}` : 'Generating a response'}
          </StatusIndicator>
        )}
        {turn.status === 'stopped' && <StatusIndicator type="stopped">{STOPPED_MESSAGE}</StatusIndicator>}
        {turn.status === 'error' && (
          <div ref={errorRef}>
            <Alert type="error" action={<Button onClick={onTryAgain}>Try again</Button>}>
              {ERROR_MESSAGE}
            </Alert>
          </div>
        )}

        {/* Error state: unchanged from GA-1, every cited source and no "View all sources". */}
        {turn.status === 'error' && sources.length > 0 && <SourceList turnId={turn.id} sources={sources} />}

        {showActions && (sources.length > 0 || sections.length > 0) && (
          <SpaceBetween size="xs">
            {sources.length > 0 && <SourceList turnId={turn.id} sources={sources.slice(0, SOURCES_SHOWN)} />}
            {/* Approved style change: a normal Button, centered, to match the live AWS Docs AI. */}
            {sections.length > 0 && (
              <Box textAlign="center">
                <Button ref={viewAllRef} onClick={() => onViewAllSources(() => viewAllRef.current?.focus())}>
                  View all sources ({sourceCount})
                </Button>
              </Box>
            )}
          </SpaceBetween>
        )}

        {showActions && (
          <ButtonGroup
            ariaLabel="Response actions"
            variant="icon"
            onItemClick={({ detail }) => {
              if (detail.id === 'regenerate') onRegenerate();
              if (detail.id === 'helpful' || detail.id === 'not-helpful') {
                setFeedback((current) => (current === detail.id ? null : detail.id));
              }
            }}
            items={[
              {
                type: 'group',
                text: 'Feedback',
                items: [
                  {
                    type: 'icon-toggle-button',
                    id: 'helpful',
                    iconName: 'thumbs-up',
                    pressedIconName: 'thumbs-up-filled',
                    text: 'Helpful',
                    pressed: feedback === 'helpful',
                  },
                  {
                    type: 'icon-toggle-button',
                    id: 'not-helpful',
                    iconName: 'thumbs-down',
                    pressedIconName: 'thumbs-down-filled',
                    text: 'Not helpful',
                    pressed: feedback === 'not-helpful',
                  },
                ],
              },
              {
                type: 'group',
                text: 'Actions',
                items: [
                  ...(canRegenerate
                    ? [{ type: 'icon-button', id: 'regenerate', iconName: 'refresh', text: 'Regenerate response' }]
                    : []),
                  ...(plainText
                    ? [
                        {
                          type: 'icon-copy-to-clipboard',
                          id: 'copy',
                          text: 'Copy',
                          textToCopy: plainText,
                          copySuccessText: 'Response copied',
                          copyErrorText: "Couldn't copy the response. Select the text and copy it instead.",
                        },
                      ]
                    : []),
                ],
              },
            ].filter((group) => group.items.length > 0)}
          />
        )}
      </SpaceBetween>
    </div>
  );
}

function SourceList({ turnId, sources }) {
  return (
    <SpaceBetween size="xs">
      <Box variant="h3">Sources</Box>
      <div data-testid="sources">
        {sources.map((source) => (
          <div key={source.url} id={`source-${turnId}-${source.number}`}>
            <Box variant="p">
              [{source.number}]{' '}
              <Link href={source.url} external externalIconAriaLabel="Opens in a new tab" variant="primary">
                {source.title}
              </Link>
            </Box>
          </div>
        ))}
      </div>
    </SpaceBetween>
  );
}
