'use client'

import type { ComponentType } from 'react'

type IconButtonSize = 'sm' | 'md' | 'lg'

type IconButtonProps = {
  icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>
  onClick: () => void
  ariaLabel: string
  size?: IconButtonSize
  className?: string
  disabled?: boolean
}

const sizeClasses: Record<IconButtonSize, { button: string; icon: string }> = {
  sm: { button: 'h-9 w-9', icon: 'h-4 w-4' },
  md: { button: 'h-10 w-10', icon: 'h-5 w-5' },
  lg: { button: 'h-11 w-11', icon: 'h-5 w-5' },
}

/** A consistent, accessible button for actions represented only by an icon. */
export const IconButton = ({
  icon: Icon,
  onClick,
  ariaLabel,
  size = 'md',
  className = '',
  disabled = false,
}: IconButtonProps) => {
  const dimensions = sizeClasses[size]

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`pointer-events-auto flex ${dimensions.button} items-center justify-center rounded-full bg-surface-dim/80 text-on-surface/60 transition active:scale-95 disabled:opacity-30 ${className}`}
    >
      <Icon className={dimensions.icon} strokeWidth={2} aria-hidden={true} />
    </button>
  )
}
