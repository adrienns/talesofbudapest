'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

export type DropdownProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger: ReactNode
  children: ReactNode
  panelProps?: HTMLAttributes<HTMLDivElement>
  closeOnEscape?: boolean
  closeOnOutsidePress?: boolean
}

/**
 * Controlled dropdown shell with shared positioning, glass styling, and dismiss behaviour.
 * The caller owns the trigger and the menu contents so the component also works for
 * search results, filters, and other non-standard dropdown content.
 */
export const Dropdown = ({
  open,
  onOpenChange,
  trigger,
  children,
  panelProps,
  closeOnEscape = true,
  closeOnOutsidePress = true,
  className = '',
  ...props
}: DropdownProps) => {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (closeOnOutsidePress && !rootRef.current?.contains(event.target as Node)) {
        onOpenChange(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (closeOnEscape && event.key === 'Escape') onOpenChange(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeOnEscape, closeOnOutsidePress, onOpenChange, open])

  const { className: panelClassName = '', ...restPanelProps } = panelProps ?? {}

  return (
    <div ref={rootRef} data-state={open ? 'open' : 'closed'} className={`relative ${className}`.trim()} {...props}>
      {trigger}
      {open && (
        <div
          className={`glass-dropdown__panel absolute inset-x-0 top-[calc(100%+0.75rem)] z-50 origin-top rounded-[1.75rem] ${panelClassName}`.trim()}
          {...restPanelProps}
        >
          {children}
        </div>
      )}
    </div>
  )
}
