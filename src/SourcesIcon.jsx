// Lisa's custom Sources icon, from design/icon-sources-cloudscape.svg (paths unchanged).
export default function SourcesIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <path className="stroke-linejoin-round" d="M2 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3.5c0 2-1.2 3.2-3 3.5M2 5v2a1 1 0 0 0 1 1h3" />
      <path className="stroke-linejoin-round" d="M10 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3.5c0 2-1.2 3.2-3 3.5M10 5v2a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

// Pressed state, from design/icon-sources-cloudscape-filled.svg (paths unchanged).
export function SourcesFilledIcon() {
  return (
    <svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <path className="stroke-linejoin-round filled" d="M2 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3H3a1 1 0 0 1-1-1V5z" />
      <path className="stroke-linejoin-round" d="M6 8v.5c0 2-1.2 3.2-3 3.5" />
      <path className="stroke-linejoin-round filled" d="M10 5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v3h-3a1 1 0 0 1-1-1V5z" />
      <path className="stroke-linejoin-round" d="M14 8v.5c0 2-1.2 3.2-3 3.5" />
    </svg>
  );
}
