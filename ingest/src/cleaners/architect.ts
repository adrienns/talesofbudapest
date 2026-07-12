const LABELED_ARCHITECT_PATTERN = /tervező\s*[:：]?\s*(.+)/i

const STORY_ARCHITECT_PATTERNS = [
  /lakóházat az a\s+([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}\s.'-]+?)\s+építész/iu,
  /épületet\s+([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}\s.'-]+?)\s+építész/iu,
  /\b([A-ZÁÉÍÓÖŐÚÜŰ][\p{L}\s.'-]{2,40})\s+építész(?:\s+tervezte)?/iu,
]

export const parseArchitect = (
  labeledValue: string | null,
  storyText: string,
): string | null => {
  if (labeledValue?.trim()) {
    return labeledValue.trim()
  }

  const labeledInStory = storyText.match(LABELED_ARCHITECT_PATTERN)
  if (labeledInStory?.[1]) {
    return labeledInStory[1].trim()
  }

  for (const pattern of STORY_ARCHITECT_PATTERNS) {
    const match = storyText.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return null
}
