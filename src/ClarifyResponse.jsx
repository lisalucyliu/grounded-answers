import Box from '@cloudscape-design/components/box';
import SpaceBetween from '@cloudscape-design/components/space-between';
import SupportPromptGroup from '@cloudscape-design/chat-components/support-prompt-group';

// GA-5c: code asks which list item the reader means. No actions, no sources.
// The prompts stay after a pick and any of them can be picked again (as on the live AWS Docs AI).
// They hide while a response generates and come back when it is complete, stopped or in error.
export default function ClarifyResponse({ turn, hidePrompts, onPick }) {
  return (
    <div data-testid="clarify">
      <SpaceBetween size="s">
        <Box variant="p" fontWeight="bold">
          {turn.clarifyQuestion}
        </Box>
        {/* Support prompt group has ariaLabel only (no ariaLabelledby), so the group gets the question's words. */}
        {!hidePrompts && (
          <SupportPromptGroup
            ariaLabel={turn.clarifyQuestion}
            items={turn.items.map((name, index) => ({ id: String(index), text: name }))}
            onItemClick={({ detail }) => onPick(Number(detail.id))}
          />
        )}
      </SpaceBetween>
    </div>
  );
}
