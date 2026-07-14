'use client'

import type { ButtonHTMLAttributes } from 'react'

export const primaryAction3dClass = 'map-play-button text-white'

type PrimaryActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readyGlow?: boolean
}

export const PrimaryActionButton = ({
  readyGlow = false,
  className = '',
  type = 'button',
  ...props
}: PrimaryActionButtonProps) => (
  <button
    type={type}
    className={`${primaryAction3dClass} rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${readyGlow ? 'play-ready-glow' : ''} ${className}`.trim()}
    {...props}
  />
)
