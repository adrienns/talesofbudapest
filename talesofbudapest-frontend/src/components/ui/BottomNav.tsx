'use client'

import { BookOpen, Home, Library, Settings, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { NAV_TAB_IDS } from '@/constants/navigation'
import type { BottomNavProps, NavTabId } from '@/types/navigation'

const NAV_ICONS: Record<NavTabId, LucideIcon> = {
  map: Home,
  narrative: BookOpen,
  archives: Library,
  settings: Settings,
}

const NAV_LABEL_KEYS: Record<NavTabId, 'home' | 'narrative' | 'archives' | 'settings'> = {
  map: 'home',
  narrative: 'narrative',
  archives: 'archives',
  settings: 'settings',
}

export const BottomNav = ({
  activeTab,
  onTabChange,
  onAiGuideClick,
  className = '',
  variant = 'default',
}: BottomNavProps) => {
  const t = useTranslations('nav')

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}
    >
      <div className="pointer-events-auto flex items-center gap-2">
        <nav
          role="tablist"
          aria-label={t('mainNavigation')}
          className={`bottom-nav-capsule ${variant === 'map' ? 'bottom-nav-capsule--map' : ''} flex items-center gap-1 px-2 py-2`}
        >
          {NAV_TAB_IDS.map((id) => {
            const Icon = NAV_ICONS[id]
            const isActive = activeTab === id
            const label = t(NAV_LABEL_KEYS[id])

            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onTabChange(id)}
                className={`bottom-nav-btn flex h-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
                  isActive
                    ? `gap-2 px-4 ${variant === 'map' ? 'bottom-nav-btn--map-active' : 'bottom-nav-btn--active'}`
                    : 'w-11 bottom-nav-btn--inactive'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {isActive && (
                  <span className="bottom-nav-btn__label whitespace-nowrap text-sm font-medium">{label}</span>
                )}
              </button>
            )
          })}
        </nav>

        {onAiGuideClick && (
          <button
            type="button"
            onClick={onAiGuideClick}
            aria-label={t('openAiGuide')}
            className="bottom-nav-ai-button flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition active:scale-95"
          >
            <Sparkles className="bottom-nav-ai-button__icon h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
