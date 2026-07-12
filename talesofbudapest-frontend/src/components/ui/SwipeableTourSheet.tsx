'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { animate, motion, useDragControls, useMotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { SheetSnap, SwipeableTourSheetProps } from '@/types/tourSheet'

const BOTTOM_OFFSET = 'calc(5.25rem + env(safe-area-inset-bottom))'
const EXPANDED_BOTTOM_OFFSET = 'max(0.75rem, env(safe-area-inset-bottom))'
const COLLAPSED_VH = 0.36
const EXPANDED_VH = 0.82
const SNAP_VELOCITY = 420

type SheetMetrics = {
  expandedPx: number
  collapsedPx: number
  maxDragPx: number
}

const measureSheet = (): SheetMetrics => {
  if (typeof window === 'undefined') {
    return { expandedPx: 520, collapsedPx: 240, maxDragPx: 280 }
  }

  const vh = window.innerHeight
  const expandedPx = Math.round(vh * EXPANDED_VH)
  const collapsedPx = Math.round(vh * COLLAPSED_VH)
  return {
    expandedPx,
    collapsedPx,
    maxDragPx: Math.max(0, expandedPx - collapsedPx),
  }
}

export const SwipeableTourSheet = ({
  snap,
  onSnapChange,
  hideBottomNav = false,
  collapsed,
  expanded,
  ariaLabel,
}: SwipeableTourSheetProps) => {
  const t = useTranslations('player')
  const [metrics, setMetrics] = useState<SheetMetrics>(measureSheet)
  const y = useMotionValue(metrics.maxDragPx)
  const dragControls = useDragControls()

  const refreshMetrics = useCallback(() => {
    setMetrics(measureSheet())
  }, [])

  useEffect(() => {
    refreshMetrics()
    window.addEventListener('resize', refreshMetrics)
    return () => window.removeEventListener('resize', refreshMetrics)
  }, [refreshMetrics])

  useEffect(() => {
    const targetY = snap === 'collapsed' ? metrics.maxDragPx : 0
    const controls = animate(y, targetY, { type: 'spring', stiffness: 420, damping: 38 })
    return () => controls.stop()
  }, [metrics.maxDragPx, snap, y])

  const dragConstraints = useMemo(
    () => ({ top: 0, bottom: metrics.maxDragPx }),
    [metrics.maxDragPx],
  )

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const projected = y.get() + info.velocity.y * 0.18
      const shouldExpand =
        info.velocity.y < -SNAP_VELOCITY ||
        (info.velocity.y <= SNAP_VELOCITY && projected < metrics.maxDragPx * 0.45)

      onSnapChange(shouldExpand ? 'expanded' : 'collapsed')
    },
    [metrics.maxDragPx, onSnapChange, y],
  )

  return (
    <>
      {snap === 'expanded' && (
        <button
          type="button"
          aria-label={t('collapseSheet')}
          onClick={() => onSnapChange('collapsed')}
          className="fixed inset-0 z-30 bg-primary/20 backdrop-blur-[1px] transition-opacity"
        />
      )}

      <motion.aside
        role="region"
        aria-label={ariaLabel}
        aria-expanded={snap === 'expanded'}
        className="fixed inset-x-0 z-40 mx-auto w-full max-w-lg"
        style={{
          bottom: snap === 'expanded' && hideBottomNav ? EXPANDED_BOTTOM_OFFSET : BOTTOM_OFFSET,
          height: metrics.expandedPx,
          y,
        }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={dragConstraints}
        dragElastic={0.06}
        onDragEnd={handleDragEnd}
      >
        <div className="glass-drawer flex h-full flex-col overflow-hidden rounded-t-[var(--glass-radius-drawer)]">
          <div
            className="flex shrink-0 cursor-grab flex-col items-center px-5 pt-3 active:cursor-grabbing"
            onPointerDown={(event) => dragControls.start(event)}
            onClick={() => {
              if (snap === 'collapsed') {
                onSnapChange('expanded')
              }
            }}
            onDoubleClick={() => onSnapChange(snap === 'collapsed' ? 'expanded' : 'collapsed')}
          >
            <div className="mb-3 h-1 w-[3.125rem] rounded-sm bg-on-surface/80" aria-hidden="true" />
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {snap === 'collapsed' ? (
              <div className="flex h-full flex-col px-5 pb-4">{collapsed}</div>
            ) : (
              <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {expanded}
              </div>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  )
}
