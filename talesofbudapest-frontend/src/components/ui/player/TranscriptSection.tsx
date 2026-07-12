'use client'

import { FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'
import { scriptToLines } from '@/lib/narrative/scriptToLines'

type TranscriptSectionProps = {
  script?: string | null
  isGenerating?: boolean
}

export const TranscriptSection = ({ script, isGenerating = false }: TranscriptSectionProps) => {
  const t = useTranslations('player')
  const lines = useMemo(() => (script ? scriptToLines(script) : []), [script])

  return (
    <section className="rounded-2xl bg-on-surface/[0.03] p-4">
      <div className="mb-3 flex items-center gap-2 text-on-surface/60">
        <FileText className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        <h2 className="text-[0.625rem] font-semibold uppercase tracking-[0.14em]">
          {t('transcript')}
        </h2>
      </div>

      {lines.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {lines.map((line, index) => (
            <p key={index} className="font-serif text-lg leading-snug text-on-surface/80">
              {line}
            </p>
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
