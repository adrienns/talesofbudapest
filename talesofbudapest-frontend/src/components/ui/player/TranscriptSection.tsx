'use client'

import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef } from 'react'
import { scriptToLines } from '@/lib/narrative/scriptToLines'

type TranscriptSectionProps = {
  script?: string | null
  isGenerating?: boolean
  currentTime: number
  duration: number
  hasAudio: boolean
  onSeek: (time: number) => void
}

export const TranscriptSection = ({
  script,
  isGenerating = false,
  currentTime,
  duration,
  hasAudio,
  onSeek,
}: TranscriptSectionProps) => {
  const t = useTranslations('player')
  const lines = useMemo(() => (script ? scriptToLines(script) : []), [script])
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([])
  const lineStarts = useMemo(() => {
    if (!duration || lines.length === 0) return lines.map(() => 0)

    const totalWeight = lines.reduce((sum, line) => sum + Math.max(1, line.split(/\s+/).length), 0)
    let elapsed = 0
    return lines.map((line) => {
      const start = (elapsed / totalWeight) * duration
      elapsed += Math.max(1, line.split(/\s+/).length)
      return start
    })
  }, [duration, lines])
  const activeLineIndex = useMemo(() => {
    if (!hasAudio || duration <= 0 || lineStarts.length === 0) return -1
    for (let index = lineStarts.length - 1; index >= 0; index -= 1) {
      if (currentTime >= lineStarts[index]) return index
    }
    return 0
  }, [currentTime, duration, hasAudio, lineStarts])

  useEffect(() => {
    if (activeLineIndex < 0) return
    lineRefs.current[activeLineIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [activeLineIndex])

  return (
    <section className="rounded-2xl bg-on-surface/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2 text-on-surface/60">
        <FileText className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        <h2 className="text-[0.625rem] font-semibold uppercase tracking-[0.14em]">
          {t('transcript')}
        </h2>
      </div>

      {lines.length > 0 && hasAudio && (
        <p className="-mt-1 mb-3 text-[0.6875rem] text-on-surface/45">{t('tapTranscriptToSeek')}</p>
      )}

      {lines.length > 0 ? (
        <div className="flex flex-col gap-1">
          {lines.map((line, index) => (
            <button
              key={`${line}-${index}`}
              ref={(element) => { lineRefs.current[index] = element }}
              type="button"
              disabled={!hasAudio || duration <= 0}
              onClick={() => onSeek(lineStarts[index])}
              aria-current={index === activeLineIndex ? 'true' : undefined}
              className={`w-full rounded-xl px-2 py-2 text-left font-serif text-lg leading-snug transition-colors disabled:cursor-default ${
                index === activeLineIndex
                  ? 'bg-[var(--map-orange)]/10 text-on-surface'
                  : 'text-on-surface/55 hover:bg-on-surface/[0.035]'
              }`}
            >
              {line}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[0.8125rem] leading-relaxed text-on-surface/45">
          {isGenerating ? t('generatingYourTour') : t('transcriptUnavailable')}
        </p>
      )}
    </section>
  )
}
