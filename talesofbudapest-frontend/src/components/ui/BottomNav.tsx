'use client'

import { BookOpen, Home, Library, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NAV_TABS } from '@/constants/navigation'
import type { BottomNavProps, NavTabId } from '@/types/navigation'

const NAV_ICONS: Record<NavTabId, LucideIcon> = {
  map: Home,
  narrative: BookOpen,
  archives: Library,
  settings: Settings,
}

export const BottomNav = ({
  activeTab,
  onTabChange,
  onAiGuideClick,
  className = '',
}: BottomNavProps) => (
  <div
    className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${className}`}
  >
    <nav
      role="tablist"
      aria-label="Main navigation"
      className="bottom-nav-capsule pointer-events-auto flex items-center gap-2 px-3 py-2"
    >
      {NAV_TABS.map(({ id, label }) => {
        const Icon = NAV_ICONS[id]
        const isActive = activeTab === id

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onTabChange(id)}
            className={`bottom-nav-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${
              isActive ? 'terracotta-glow-btn' : 'bottom-nav-btn--inactive'
            }`}
          >
            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          </button>
        )
      })}

      {onAiGuideClick && (
        <button
          type="button"
          onClick={onAiGuideClick}
          aria-label="Open AI guide"
          className="bottom-nav-ai-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95"
        >
          <span className="bottom-nav-ai-n" aria-hidden="true">
            N
          </span>
        </button>
      )}
    </nav>
  </div>
)
