const ABBREVIATION = /\b(?:St|Mr|Mrs|Ms|Dr|Sr|Jr|Prof|No|vs|etc)\.$/

export const scriptToLines = (script: string): string[] => {
  const normalized = script.replace(/\s+/g, ' ').trim()
  const sentences =
    normalized
      .match(/[^.!?]+[.!?]*/g)
      ?.map((line) => line.trim())
      .filter(Boolean) ?? [normalized]

  return sentences.reduce<string[]>((lines, sentence) => {
    const previous = lines[lines.length - 1]
    if (previous && ABBREVIATION.test(previous)) {
      lines[lines.length - 1] = `${previous} ${sentence}`
    } else {
      lines.push(sentence)
    }
    return lines
  }, [])
}
