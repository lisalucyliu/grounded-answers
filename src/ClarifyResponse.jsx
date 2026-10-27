import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SupportPromptGroup from '@cloudscape-design/chat-components/support-prompt-group';
import { CLARIFY_QUESTION } from './followUp.js';

// GA-5c: code asks which list item the reader means. No actions, no sources.
// The prompts stay after a pick and any of them can be picked again (as on the live AWS Docs AI).
export default function ClarifyResponse({ turn, onPick }) {
  return (
    <div data-testid="clarify">
      <SpaceBetween size="s">
        <Box variant="p" fontWeight="bold">
          {CLARIFY_QUESTION}
        </Box>
        <SupportPromptGroup
          ariaLabel="Options"
          items={turn.items.map((name, index) => ({ id: String(index), text: name }))}
          onItemClick={({ detail }) => onPick(Number(detail.id))}
        />
      </SpaceBetween>
    </div>
  );
}
