import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ButtonGroup from '@cloudscape-design/components/button-group';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import { useEffect, useRef, useState } from 'react';
import { collectSources } from './streamAnswer.js';

export const STOPPED_MESSAGE = 'Stopped. This response is not complete.';
export const ERROR_MESSAGE = "Something went wrong and the response didn't finish. Your question is saved.";

// Splits the streamed text blocks into paragraphs, and puts a [n] marker
// after the text that each citation supports.
function buildParagraphs(blocks, markersByBlock, turnId) {
  const paragraphs = [[]];
  blocks.forEach((block, blockIndex) => {
    block.text.split(/\n\s*\n/).forEach((part, partIndex) => {
      if (partIndex > 0) paragraphs.push([]);
      if (part) paragraphs.at(-1).push(part.replace(/^\n+/, ''));
    });
    for (const number of markersByBlock[blockIndex]) {
      paragraphs.at(-1).push(
        <span key={`marker-${blockIndex}-${number}`}>
          {' '}
          <Link href={`#source-${turnId}-${number}`} variant="primary" ariaLabel={`Source ${number}`}>
            [{number}]
          </Link>
        </span>
      );
    }
  });
  return paragraphs.filter((paragraph) => paragraph.some((piece) => typeof piece !== 'string' || piece.trim()));
}

export default function Response({ turn, canRegenerate, onRegenerate, onTryAgain }) {
  const [feedback, setFeedback] = useState(null);
  const errorRef = useRef(null);

  // Bring a new error into view so it isn't hidden below the fold or behind the prompt input.
  useEffect(() => {
    if (turn.status === 'error') errorRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turn.status]);
  const blocks = Object.keys(turn.blocks)
    .sort((a, b) => a - b)
    .map((index) => turn.blocks[index]);
  const { sources, markersByBlock } = collectSources(blocks);
  const paragraphs = buildParagraphs(blocks, markersByBlock, turn.id);
  const plainText = blocks.map((block) => block.text).join('').trim();
  const isGenerating = turn.status === 'loading' || turn.status === 'streaming';
  const showActions = turn.status === 'stopped' || turn.status === 'complete';

  return (
    <div data-testid="response">
      <SpaceBetween size="m">
        {paragraphs.length > 0 && (
          <div data-testid="response-text">
            {paragraphs.map((pieces, index) => (
              <Box variant="p" key={index}>
                {pieces}
              </Box>
            ))}
          </div>
        )}

        {isGenerating && <StatusIndicator type="loading">Generating a response</StatusIndicator>}
        {turn.status === 'stopped' && <StatusIndicator type="stopped">{STOPPED_MESSAGE}</StatusIndicator>}
        {turn.status === 'error' && (
          <div ref={errorRef}>
            <Alert type="error" action={<Button onClick={onTryAgain}>Try again</Button>}>
              {ERROR_MESSAGE}
            </Alert>
          </div>
        )}

        {!isGenerating && sources.length > 0 && (
          <SpaceBetween size="xs">
            <Box variant="h3">Sources</Box>
            <div data-testid="sources">
              {sources.map((source) => (
                <div key={source.url} id={`source-${turn.id}-${source.number}`}>
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
