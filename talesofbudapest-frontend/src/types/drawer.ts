import type { ReactNode } from 'react'

export type BottomDrawerProps = {
  isOpen: boolean
  onClose: () => void
  label?: string
  title?: string
  children: ReactNode
  footer?: ReactNode
  showBackdrop?: boolean
  ariaLabel?: string
}
