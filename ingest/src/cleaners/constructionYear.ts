const LABELED_YEAR_PATTERN = /építés\s+éve\s*[:：]?\s*(\d{4})/i

const STORY_YEAR_PATTERNS = [
  /(?:épült|építve|felépült|építése|megépült)[^.]{0,80}?(\d{4})/i,
  /(\d{4})[-–](\d{4})\s*között/i,
  /(\d{4})-ra\s+felépül/i,
]

export const parseConstructionYear = (
  labeledValue: string | null,
  storyText: string,
): number | null => {
  if (labeledValue) {
    const labeledMatch = labeledValue.match(/(\d{4})/)
    if (labeledMatch) {
      return Number(labeledMatch[1])
    }
  }

  const labeledInStory = storyText.match(LABELED_YEAR_PATTERN)
  if (labeledInStory) {
    return Number(labeledInStory[1])
  }

  for (const pattern of STORY_YEAR_PATTERNS) {
    const match = storyText.match(pattern)
    if (match) {
      return Number(match[1])
    }
  }

  return null
}
