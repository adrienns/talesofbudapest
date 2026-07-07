'use client'

type ContextChipProps = {
  label: string
  onSelect: (label: string) => void
}

export const ContextChip = ({ label, onSelect }: ContextChipProps) => (
  <button
    type="button"
    onClick={() => onSelect(label)}
    className="context-chip shrink-0 rounded-full border border-accent/40 bg-transparent px-4 py-2 text-sm font-medium text-accent transition active:scale-95"
  >
    {label}
  </button>
)
