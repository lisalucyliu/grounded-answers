import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { borderWidthLayoutSideNavigation, colorBorderDividerDefault } from '@cloudscape-design/design-tokens';
import { useEffect, useRef } from 'react';
import { sourceTitle } from './streamAnswer.js';

function SourceLink({ section }) {
  return (
    <Link href={section.url} external externalIconAriaLabel="Opens in a new tab" variant="primary">
      {sourceTitle(section)}
    </Link>
  );
}

// Every section sent to Claude for one turn: the cited ones with their [n] numbers,
// then the rest under "Also read, not cited".
export default function SourcesPanel({ sources, onClose }) {
  const titleRef = useRef(null);

  // Move focus to the panel title when the panel opens or switches to another turn.
  useEffect(() => {
    const heading = titleRef.current?.querySelector('h2');
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [sources.turnId]);

  return (
    <div
      data-testid="sources-panel"
      className="ga-sources-panel"
      // Approved style change: a plain panel with one divider on its right edge, as on the live AWS Docs AI.
      style={{ borderInlineEnd: `${borderWidthLayoutSideNavigation} solid ${colorBorderDividerDefault}` }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <Box padding={{ right: 'l', bottom: 'l' }}>
        <SpaceBetween size="l">
          <div ref={titleRef}>
            <Header
              variant="h2"
              actions={<Button variant="icon" iconName="angle-left" ariaLabel="Close sources" onClick={onClose} />}
            >
              Sources
            </Header>
          </div>
          {/* A text line, not a heading, so the heading order doesn't change. */}
          <Box fontSize="heading-xs" fontWeight="bold">
            For: {sources.question}
          </Box>

          <SpaceBetween size="xs">
            {/* Same size and weight as the "Also read, not cited" header (16px bold), still an h3. */}
            <Box variant="h3" fontSize="heading-s" fontWeight="bold">
              Cited in this answer ({sources.cited.length})
            </Box>
            <div data-testid="panel-cited">
              {sources.cited.map((source) => (
                <Box variant="p" key={source.url}>
                  [{source.number}] <SourceLink section={source.section} />
                </Box>
              ))}
            </div>
          </SpaceBetween>

          <ExpandableSection headerText={`Also read, not cited (${sources.alsoRead.length})`} headingTagOverride="h3">
            <div data-testid="panel-also-read">
              {sources.alsoRead.map((section) => (
                <Box variant="p" key={section.url}>
                  <SourceLink section={section} />
                </Box>
              ))}
            </div>
          </ExpandableSection>
        </SpaceBetween>
      </Box>
    </div>
  );
}
