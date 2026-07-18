'use client'

import { useTranslations } from 'next-intl'
import { BottomNav } from '@/components/ui/BottomNav'
import { TOUR_STYLES } from '@/constants/questionnaire'
import { isTourStyleId, type TourStyleId } from '@/constants/tourStyles'
import { useRouter } from '@/i18n/navigation'
import { useLocalePreference } from '@/stores/localeStore'
import { useMapSettingsStore } from '@/stores/mapSettingsStore'
import { useTourPreferencesStore } from '@/stores/tourPreferencesStore'
import { SUPPORTED_LOCALES } from '@/types/locale'
import type { NavTabId } from '@/types/navigation'

const STYLE_LABEL_KEYS: Record<TourStyleId, 'styleEasy' | 'styleStoryteller' | 'styleDeepDive'> = {
  easy: 'styleEasy',
  storyteller: 'styleStoryteller',
  'deep-dive': 'styleDeepDive',
}

const SettingsPage = () => {
  const router = useRouter()
  const { locale, setLocale } = useLocalePreference()
  const showAllBuildings = useMapSettingsStore((state) => state.showAllBuildings)
  const setShowAllBuildings = useMapSettingsStore((state) => state.setShowAllBuildings)
  const styleId = useTourPreferencesStore((state) => state.styleId)
  const setStyleId = useTourPreferencesStore((state) => state.setStyleId)
  const t = useTranslations('settings')

  const handleTabChange = (tab: NavTabId) => {
    if (tab === 'explore') {
      router.push('/')
      return
    }

    if (tab === 'tours') {
      router.push('/tours')
    }
  }

  return (
    <main className="flex h-[100dvh] flex-col bg-background">
      <div className="flex-1 px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <p className="text-label text-accent">{t('label')}</p>
        <h1 className="text-headline mt-2 text-on-surface">{t('title')}</h1>

        <section className="mt-8">
          <h2 className="text-body font-semibold text-on-surface">{t('language')}</h2>
          <p className="mt-1 text-sm text-on-surface/55">{t('languageDescription')}</p>

          <div className="mt-4 flex flex-col gap-2">
            {SUPPORTED_LOCALES.map((option) => {
              const isActive = option === locale
              const label = option === 'en' ? t('english') : t('hungarian')

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLocale(option)}
                  aria-pressed={isActive}
                  className={`rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                    isActive
                      ? 'border-accent bg-accent/10 text-on-surface'
                      : 'border-outline-variant/40 bg-surface text-on-surface/80'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-body font-semibold text-on-surface">{t('tourStyle')}</h2>
          <p className="mt-1 text-sm text-on-surface/55">{t('tourStyleDescription')}</p>

          <div className="mt-4 flex flex-col gap-2">
            {TOUR_STYLES.map((style) => {
              const styleKey = isTourStyleId(style.id) ? STYLE_LABEL_KEYS[style.id] : 'styleStoryteller'
              const isActive = styleId === style.id
              const Icon = style.icon

              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    if (isTourStyleId(style.id)) {
                      setStyleId(style.id)
                    }
                  }}
                  aria-pressed={isActive}
                  className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99] ${
                    isActive
                      ? 'border-accent bg-accent/10 text-on-surface'
                      : 'border-outline-variant/40 bg-surface text-on-surface/80'
                  }`}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <span>
                    <span className="block text-body font-medium text-on-surface">{t(styleKey)}</span>
                    <span className="mt-1 block text-sm text-on-surface/55">{style.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-body font-semibold text-on-surface">{t('map')}</h2>
          <p className="mt-1 text-sm text-on-surface/55">{t('mapDescription')}</p>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-outline-variant/40 bg-surface px-4 py-3">
            <input
              type="checkbox"
              checked={showAllBuildings}
              onChange={(event) => setShowAllBuildings(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
            />
            <span>
              <span className="block text-body font-medium text-on-surface">{t('showAllBuildings')}</span>
              <span className="mt-1 block text-sm text-on-surface/55">
                {t('showAllBuildingsDescription')}
              </span>
            </span>
          </label>
        </section>
      </div>

      <BottomNav
        activeTab="settings"
        onTabChange={handleTabChange}
        onCreateTour={() => router.push('/?createTour=1&returnTo=settings')}
        onOpenAiGuide={() => router.push('/?guide=1&returnTo=settings')}
      />
    </main>
  )
}

export default SettingsPage
