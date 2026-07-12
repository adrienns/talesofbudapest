'use client'

import type { ButtonHTMLAttributes } from 'react'

export const terracottaGlowClass =
  'bg-[linear-gradient(145deg,var(--color-sunset-start),var(--color-accent-deep))] text-white shadow-[0_0_20px_var(--color-accent-glow),0_4px_14px_rgba(166,77,31,0.4)] hover:enabled:shadow-[0_0_28px_var(--color-accent-pulse-selected),0_6px_18px_rgba(166,77,31,0.45)]'

type TerracottaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readyGlow?: boolean
}

export const TerracottaButton = ({
  readyGlow = false,
  className = '',
  type = 'button',
  ...props
}: TerracottaButtonProps) => (
  <button
    type={type}
    className={`${terracottaGlowClass} rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${readyGlow ? 'play-ready-glow' : ''} ${className}`.trim()}
    {...props}
  />
)
