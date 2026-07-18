'use client'

import { useLocale, useTranslations } from 'next-intl'
import { BottomNav } from '@/components/ui/BottomNav'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useNarratives } from '@/features/narrative/hooks/useNarratives'
import { useRouter } from '@/i18n/navigation'
import type { NavTabId } from '@/types/navigation'

const formatDate = (value: string, locale: string) =>
  new Date(value).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const ToursPage = () => {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('archives')
  const { narratives, isLoading, error } = useNarratives()

  const handleTabChange = (tab: NavTabId) => {
    if (tab === 'explore') {
      router.push('/')
      return
    }

    if (tab === 'tours') {
      return
    }

    if (tab === 'settings') {
      router.push('/settings')
    }
  }

  const handleOpenNarrative = (id: string) => {
    router.push(`/?narrativeId=${id}`)
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-label text-accent">{t('label')}</p>
        <h1 className="text-headline mt-2 text-on-surface">{t('title')}</h1>
        <p className="mt-2 text-body text-on-surface/55">{t('subtitle')}</p>

        {isLoading && (
          <div className="mt-10">
            <LoadingScreen message={t('loading')} />
          </div>
        )}

        {error && (
          <p className="mt-8 rounded-xl border border-accent/30 px-4 py-3 text-body text-accent">
            {error}
          </p>
        )}

        {!isLoading && !error && narratives.length === 0 && (
          <p className="mt-10 text-body text-on-surface/45">{t('empty')}</p>
        )}

        <ul className="mt-8 flex flex-col gap-3">
          {narratives.map((narrative) => (
            <li key={narrative.id}>
              <button
                type="button"
                onClick={() => handleOpenNarrative(narrative.id)}
                className="w-full rounded-2xl border border-outline-variant/40 bg-surface px-4 py-4 text-left shadow-sm transition active:scale-[0.99] active:bg-surface-dim/40"
              >
                <p className="text-[1.0625rem] font-semibold tracking-tight text-on-surface">
                  {narrative.title}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-on-surface/50">{narrative.userPrompt}</p>
                <div className="mt-3 flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.12em] text-on-surface/40">
                  <span>{t('chapters', { count: narrative.chapterCount })}</span>
                  <span>•</span>
                  <span>{formatDate(narrative.createdAt, locale)}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <BottomNav
        activeTab="tours"
        onTabChange={handleTabChange}
        onCreateTour={() => router.push('/?createTour=1&returnTo=tours')}
        onOpenAiGuide={() => router.push('/?guide=1&returnTo=tours')}
      />
    </main>
  )
}

export default ToursPage
