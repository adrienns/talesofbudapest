'use client'

import { ChevronDown } from 'lucide-react'
import type { BottomDrawerProps } from '@/types/drawer'

export const BottomDrawer = ({
  isOpen,
  onClose,
  label,
  title,
  children,
  footer,
  showBackdrop = true,
  ariaLabel = 'Panel',
}: BottomDrawerProps) => (
  <>
    {showBackdrop && (
      <button
        type="button"
        aria-label={`Close ${ariaLabel.toLowerCase()}`}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-primary/25 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
    )}

    <aside
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-hidden={!isOpen}
      className={`fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${
        isOpen ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      <div className="glass-drawer mx-auto w-full max-w-lg rounded-t-[var(--glass-radius-drawer)] px-5 pb-0 pt-3">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-on-surface/10" aria-hidden="true" />

        {(label || title) && (
          <header className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {label && <p className="text-label text-accent">{label}</p>}
              {title && (
                <h2 className="text-headline mt-1 truncate text-on-surface">{title}</h2>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label={`Collapse ${ariaLabel.toLowerCase()}`}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-dim/80 text-on-surface/55 transition active:scale-95 active:bg-surface-dim active:text-on-surface"
            >
              <ChevronDown className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
            </button>
          </header>
        )}

        {children}

        {footer && (
          <div className="-mx-5 mt-5 border-t border-outline-variant px-1 pt-1">{footer}</div>
        )}
      </div>
    </aside>
  </>
)
