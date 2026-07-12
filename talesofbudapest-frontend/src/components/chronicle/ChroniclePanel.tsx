'use client'

import { BookOpen, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useLocationChronicle } from '@/features/landmarks/hooks/useLocationChronicle'
import type { ChronicleCitation } from '@/types/chronicle'

type ChroniclePanelProps = {
  locationId: string
}

const yearLabel = (start?: number | null, end?: number | null) => {
  if (!start) return null
  return end && end !== start ? `${start}–${end}` : String(start)
}

const Citation = ({ citation }: { citation: ChronicleCitation }) => {
  const t = useTranslations('chronicle')
  const text = `${citation.title}${citation.page ? ` · ${t('pageShort')} ${citation.page}` : ''}`
  return citation.url ? (
    <a
      href={citation.url}
      target="_blank"
      rel="noreferrer"
      className="text-[0.625rem] leading-tight text-accent/75 underline decoration-accent/30 underline-offset-2"
    >
      {text}
    </a>
  ) : (
    <span className="text-[0.625rem] leading-tight text-on-surface/40">{text}</span>
  )
}

export const ChroniclePanel = ({ locationId }: ChroniclePanelProps) => {
  const t = useTranslations('chronicle')
  const { chronicle, isLoading } = useLocationChronicle(locationId)
  const facts = chronicle?.facts.slice(0, 3) ?? []
  const events = chronicle?.events.slice(0, 3) ?? []
  const people = chronicle?.people.slice(0, 6) ?? []
  const isEmpty = facts.length === 0 && events.length === 0 && people.length === 0

  return (
    <section aria-label={t('title')} className="border-t border-white/60 bg-white/88 px-4 py-3 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-accent" strokeWidth={1.8} aria-hidden="true" />
        <h2 className="font-serif text-base font-bold text-on-surface">{t('title')}</h2>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-label={t('loading')}>
          <div className="h-3 w-full animate-pulse rounded bg-on-surface/10" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-on-surface/10" />
        </div>
      ) : isEmpty ? (
        <p className="text-[0.75rem] leading-relaxed text-on-surface/50">{t('empty')}</p>
      ) : (
        <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
          {[...events, ...facts]
            .sort((a, b) => (a.yearStart ?? 9999) - (b.yearStart ?? 9999))
            .slice(0, 5)
            .map((item) => {
              const isEvent = 'title' in item
              const label = item.dateLabel ?? yearLabel(item.yearStart, item.yearEnd)
              return (
                <article key={`${isEvent ? 'event' : 'fact'}-${item.id}`} className="relative pl-14">
                  <span className="absolute left-0 top-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.625rem] font-semibold text-accent">
                    {label ?? t('undated')}
                  </span>
                  <p className="font-serif text-[0.8125rem] leading-snug text-on-surface/85">
                    {isEvent ? item.title : item.statement}
                  </p>
                  {item.citations[0] && <Citation citation={item.citations[0]} />}
                </article>
              )
            })}

          {people.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-on-surface/50">
                <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                <h3 className="text-[0.625rem] font-semibold uppercase tracking-[0.12em]">
                  {t('people')}
                </h3>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {people.map((person) => (
                  <article key={person.id} className="min-w-36 rounded-xl bg-on-surface/[0.04] px-3 py-2">
                    <p className="truncate font-serif text-[0.75rem] font-semibold text-on-surface/85">
                      {person.name}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[0.625rem] leading-snug text-on-surface/45">
                      {person.relation ?? person.summary ?? t('connectedPerson')}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
