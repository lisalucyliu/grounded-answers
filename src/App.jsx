import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ButtonGroup from '@cloudscape-design/components/button-group';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import Link from '@cloudscape-design/components/link';
import LiveRegion from '@cloudscape-design/components/live-region';
import PanelLayout from '@cloudscape-design/components/panel-layout';
import PromptInput from '@cloudscape-design/components/prompt-input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Tabs from '@cloudscape-design/components/tabs';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import ChatBubble from '@cloudscape-design/chat-components/chat-bubble';
import {
  borderRadiusButton,
  borderWidthLayoutSideNavigation,
  colorBackgroundButtonPrimaryActive,
  colorBackgroundButtonPrimaryDefault,
  colorBackgroundButtonPrimaryHover,
  colorBackgroundChatBubbleIncoming,
  colorBorderDividerDefault,
  colorTextButtonPrimaryActive,
  colorTextButtonPrimaryDefault,
  colorTextButtonPrimaryHover,
  shadowContainerActive,
  spaceScaledL,
  spaceScaledXl,
  spaceStaticXs,
  spaceStaticXxs,
  spaceStaticXxxs,
} from '@cloudscape-design/design-tokens';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Response, { ERROR_MESSAGE, STOPPED_MESSAGE } from './Response.jsx';
import SourcesIcon, { SourcesFilledIcon } from './SourcesIcon.jsx';
import SourcesPanel from './SourcesPanel.jsx';
import { splitSources, streamAnswer } from './streamAnswer.js';

let nextTurnId = 1;

// Rail icon buttons are 28px squares: a 16x20 icon box, 2px border, 2px padding above and below and 4px at the sides.
// borderRadiusButton (20px) is more than half of 28px, so the button is round.
const RAIL_BUTTON_STYLE = {
  root: { paddingBlock: spaceStaticXxxs, paddingInline: spaceStaticXxs, borderRadius: borderRadiusButton },
};

// Approved style change: the open state of the rail Sources button is a blue circle with a white icon,
// like the live AWS Docs AI Settings button. Toggle button has no style API, so this is a styled Button.
const RAIL_BUTTON_ACTIVE_STYLE = {
  root: {
    ...RAIL_BUTTON_STYLE.root,
    background: {
      default: colorBackgroundButtonPrimaryDefault,
      hover: colorBackgroundButtonPrimaryHover,
      active: colorBackgroundButtonPrimaryActive,
    },
    color: {
      default: colorTextButtonPrimaryDefault,
      hover: colorTextButtonPrimaryHover,
      active: colorTextButtonPrimaryActive,
    },
  },
};

// Decoration between rail icons, hidden from screen readers.
function RailDivider() {
  return <div aria-hidden="true" style={{ borderBlockStart: `${borderWidthLayoutSideNavigation} solid ${colorBorderDividerDefault}` }} />;
}

export default function App() {
  const [turns, setTurns] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [searchText, setSearchText] = useState('');
  const [generating, setGenerating] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  // The id of the turn shown in the Sources panel, or null when the panel is closed.
  const [panelTurnId, setPanelTurnId] = useState(null);
  const restorePanelFocus = useRef(null);
  const railSourcesRef = useRef(null);
  const activeRequest = useRef(null);
  const promptRef = useRef(null);
  const mainRef = useRef(null);
  const logRef = useRef(null);
  const followNewText = useRef(true);

  // The prompt input stays pinned at the bottom and only the conversation scrolls.
  // The main column fills the space below wherever the navigation and tabs end.
  useLayoutEffect(() => {
    const measure = () => {
      const main = mainRef.current;
      // Set on the tab body, so the rail and the main column share it.
      if (main) main.parentElement.style.setProperty('--ga-main-top', `${main.getBoundingClientRect().top}px`);
    };
    measure();
    // Re-measure when anything above the column changes height, such as web fonts loading.
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    document.fonts?.ready.then(measure);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Keep new text in view, unless the reader has scrolled up to read earlier messages.
  useEffect(() => {
    const log = logRef.current;
    if (log && followNewText.current) log.scrollTop = log.scrollHeight;
  }, [turns]);

  function onLogScroll() {
    const log = logRef.current;
    followNewText.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  function updateTurn(turnId, change) {
    setTurns((current) => current.map((turn) => (turn.id === turnId ? { ...turn, ...change(turn) } : turn)));
  }

  async function run(turnId, question) {
    const controller = new AbortController();
    activeRequest.current = { controller, turnId };
    setGenerating(true);
    setAnnouncement('');
    setSearchText(question);

    const isCurrent = () => activeRequest.current?.controller === controller;
    let answerText = '';
    try {
      await streamAnswer(question, {
        signal: controller.signal,
        onEvent: (event) => {
          if (!isCurrent()) return;
          if (event.type === 'sections') {
            updateTurn(turnId, () => ({ sections: event.sections }));
          } else if (event.type === 'block') {
            updateTurn(turnId, (turn) => ({ blocks: { ...turn.blocks, [event.index]: { text: '', citations: [] } } }));
          } else if (event.type === 'text') {
            answerText += event.text;
            updateTurn(turnId, (turn) => {
              const block = turn.blocks[event.index] ?? { text: '', citations: [] };
              return {
                status: 'streaming',
                blocks: { ...turn.blocks, [event.index]: { ...block, text: block.text + event.text } },
              };
            });
          } else if (event.type === 'citation') {
            updateTurn(turnId, (turn) => {
              const block = turn.blocks[event.index] ?? { text: '', citations: [] };
              const citation = { url: event.url, title: event.title };
              return { blocks: { ...turn.blocks, [event.index]: { ...block, citations: [...block.citations, citation] } } };
            });
          }
        },
      });
      if (isCurrent()) {
        updateTurn(turnId, () => ({ status: 'complete' }));
        setAnnouncement(answerText.trim()); // Cloudscape: announce each new message.
      }
    } catch (error) {
      // A stop already set the stopped state. Anything else is a real failure.
      if (isCurrent() && !controller.signal.aborted) {
        console.error(error);
        updateTurn(turnId, () => ({ status: 'error' }));
        setAnnouncement(ERROR_MESSAGE);
      }
    } finally {
      if (isCurrent()) {
        activeRequest.current = null;
        setGenerating(false);
      }
    }
  }

  function ask(question) {
    const turn = { id: nextTurnId++, attempt: 1, question, status: 'loading', blocks: {}, sections: [], regenerated: false };
    followNewText.current = true;
    setTurns((current) => [...current, turn]);
    run(turn.id, question);
  }

  function rerun(turn, { regenerate }) {
    // The panel's turn is about to be replaced, so close the panel.
    if (panelTurnId === turn.id) closeSources();
    updateTurn(turn.id, (current) => ({
      status: 'loading',
      blocks: {},
      sections: [],
      attempt: current.attempt + 1,
      regenerated: current.regenerated || regenerate,
    }));
    run(turn.id, turn.question);
  }

  function stop() {
    const request = activeRequest.current;
    if (!request) return;
    activeRequest.current = null;
    request.controller.abort(); // Closes the connection. The server sees this and stops the Claude stream.
    updateTurn(request.turnId, () => ({ status: 'stopped' }));
    setGenerating(false);
    setAnnouncement(STOPPED_MESSAGE);
    setTimeout(() => promptRef.current?.focus());
  }

  function send() {
    const question = prompt.trim();
    if (generating || !question) return;
    setPrompt('');
    ask(question);
  }

  const lastTurn = turns.at(-1);
  const panelTurn = turns.find((turn) => turn.id === panelTurnId);
  const panelSources = panelTurn && {
    turnId: `${panelTurn.id}-${panelTurn.attempt}`,
    question: panelTurn.question,
    ...splitSources(
      Object.keys(panelTurn.blocks)
        .sort((a, b) => a - b)
        .map((index) => panelTurn.blocks[index]),
      panelTurn.sections
    ),
  };

  // Opens the panel on one turn. restoreFocus puts focus back on the control that opened it.
  function openSources(turn, restoreFocus) {
    restorePanelFocus.current = restoreFocus;
    setPanelTurnId(turn.id);
  }

  function closeSources() {
    setPanelTurnId(null);
    const restore = restorePanelFocus.current;
    restorePanelFocus.current = null;
    setTimeout(() => {
      restore?.();
      // The opener can be gone, for example "View all sources" on a turn that is regenerating.
      if (document.activeElement === document.body) promptRef.current?.focus();
    });
  }

  // Rail icon: opens the latest turn that is complete or stopped. Does nothing if there isn't one yet.
  function toggleSourcesFromRail() {
    if (panelSources) return closeSources();
    const turn = turns.findLast(
      (candidate) => ['complete', 'stopped'].includes(candidate.status) && candidate.sections.length > 0
    );
    if (turn) openSources(turn, () => railSourcesRef.current?.focus());
  }

  const aiTab = (
    <div className="ga-tab-body">
      <div className="ga-rail" style={{ paddingInlineEnd: spaceScaledL, paddingBlockEnd: spaceScaledL }}>
        {/* Approved style change: gray shadow, no outline, full height, as on the live AWS Docs AI rail. */}
        <Container
          fitHeight
          style={{
            root: { borderColor: 'transparent', boxShadow: shadowContainerActive },
            content: { paddingInline: spaceStaticXs },
          }}
        >
          <SpaceBetween size="m">
            <Button variant="icon" iconName="edit" ariaLabel="New conversation" style={RAIL_BUTTON_STYLE} />
            <RailDivider />
            <Button variant="icon" iconName="download" ariaLabel="Download conversation" style={RAIL_BUTTON_STYLE} />
            <RailDivider />
            <Button
              ref={railSourcesRef}
              variant="icon"
              iconSvg={panelSources ? <SourcesFilledIcon /> : <SourcesIcon />}
              ariaLabel="Sources"
              nativeButtonAttributes={{ 'aria-pressed': Boolean(panelSources) }}
              style={panelSources ? RAIL_BUTTON_ACTIVE_STYLE : RAIL_BUTTON_STYLE}
              onClick={toggleSourcesFromRail}
            />
            <RailDivider />
            <Button variant="icon" iconName="settings" ariaLabel="Settings" style={RAIL_BUTTON_STYLE} />
          </SpaceBetween>
        </Container>
      </div>

      <div className="ga-main" ref={mainRef}>
        <PanelLayout
          panelPosition="side-start"
          display={panelSources ? 'all' : 'main-only'}
          defaultPanelSize={360}
          panelContent={panelSources && <SourcesPanel sources={panelSources} onClose={closeSources} />}
          mainContent={
            // Panel layout clips its content area, so the chat column leaves room for the prompt input's shadow.
            // The same padding is the gap next to the panel's divider.
            <div className="ga-chat" style={{ paddingInline: spaceScaledXl }}>
              <div className="ga-log" ref={logRef} onScroll={onLogScroll}>
                <Box padding={{ bottom: 'l' }}>
                  <SpaceBetween size="l">
                    {turns.length > 0 && <Header variant="h1">{turns[0].question}</Header>}
                    <div role="region" aria-label="Chat">
                      <SpaceBetween size="l">
                        {turns.map((turn) => (
                          <SpaceBetween size="l" key={turn.id}>
                            <ChatBubble
                              type="outgoing"
                              align="end"
                              avatar={null}
                              ariaLabel="Your question"
                              // Approved style change: gray user bubble to match the current AWS Docs AI layout.
                              style={{ bubble: { background: colorBackgroundChatBubbleIncoming } }}
                            >
                              {turn.question}
                            </ChatBubble>
                            <Response
                              key={`${turn.id}-${turn.attempt}`}
                              turn={turn}
                              canRegenerate={turn === lastTurn && turn.status === 'stopped' && !turn.regenerated}
                              onRegenerate={() => rerun(turn, { regenerate: true })}
                              onTryAgain={() => rerun(turn, { regenerate: false })}
                              onViewAllSources={(restoreFocus) => openSources(turn, restoreFocus)}
                            />
                          </SpaceBetween>
                        ))}
                      </SpaceBetween>
                    </div>
                  </SpaceBetween>
                </Box>
              </div>

              <div className="ga-prompt">
                <Box padding={{ vertical: 's' }}>
                  <SpaceBetween size="xs">
                    <PromptInput
                      ref={promptRef}
                      value={prompt}
                      onChange={({ detail }) => setPrompt(detail.value)}
                      onAction={send}
                      placeholder={generating ? 'Waiting for response...' : 'Ask a question'}
                      ariaLabel="Ask a question"
                      minRows={3}
                      actionButtonIconName="send"
                      disableActionButton={!prompt.trim()}
                      i18nStrings={{ actionButtonAriaLabel: 'Send' }}
                    // Approved style change: gray shadow, no outline, as on the live AWS Docs AI prompt input.
                    // The focus state keeps Cloudscape's own border, so the focus indicator stays visible.
                    style={{
                      root: {
                        borderColor: { default: 'transparent', hover: 'transparent' },
                        boxShadow: { default: shadowContainerActive, hover: shadowContainerActive },
                      },
                    }}
                      customPrimaryAction={
                        generating ? (
                          <ButtonGroup
                            ariaLabel="Response generation"
                            variant="icon"
                            onItemClick={stop}
                            items={[{ type: 'icon-button', id: 'stop', iconName: 'stop-circle', text: 'Stop generation' }]}
                          />
                        ) : undefined
                      }
                    />
                    <Box fontSize="body-s" color="text-body-secondary" textAlign="right">
                      Ask Docs is AI and can make mistakes. Please double check responses. By chatting, you agree to this{' '}
                      <Link href="#" variant="primary" fontSize="body-s">
                        disclaimer
                      </Link>
                      .
                    </Box>
                  </SpaceBetween>
                </Box>
              </div>
            </div>
          }
        />
      </div>

      <LiveRegion hidden>
        {announcement}
      </LiveRegion>
    </div>
  );

  return (
    <>
      <TopNavigation
        identity={{ href: '#', title: 'Docs prototype' }}
        search={
          <Input
            type="search"
            value={searchText}
            onChange={({ detail }) => setSearchText(detail.value)}
            ariaLabel="Search documentation"
            placeholder="Search"
          />
        }
      />
      <Box padding={{ horizontal: 'xxl', top: 'm' }}>
        <Tabs
          tabs={[
            { id: 'docs-ai', label: 'Docs AI', content: aiTab },
            {
              id: 'all-results',
              label: 'All results',
              disabled: true,
              disabledReason: 'All results is not part of this prototype yet.',
            },
          ]}
        />
      </Box>
    </>
  );
}
