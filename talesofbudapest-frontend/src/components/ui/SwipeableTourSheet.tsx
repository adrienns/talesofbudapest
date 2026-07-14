'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { animate, LayoutGroup, motion, useDragControls, useMotionValue } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { SheetSnap, SwipeableTourSheetProps } from '@/types/tourSheet'

const BOTTOM_OFFSET = 'calc(1rem + env(safe-area-inset-bottom))'
const EXPANDED_BOTTOM_OFFSET = '0px'
const EXPANDED_VH = 1
const SNAP_VELOCITY = 420

type SheetMetrics = {
  expandedPx: number
  collapsedPx: number
  maxDragPx: number
}

const measureSheet = (): SheetMetrics => {
  if (typeof window === 'undefined') {
    return { expandedPx: 520, collapsedPx: 136, maxDragPx: 384 }
  }

  const vh = window.innerHeight
  const expandedPx = Math.round(vh * EXPANDED_VH)
  const collapsedPx = Math.min(148, Math.max(128, Math.round(vh * 0.19)))
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
  const y = useMotionValue(0)
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
    const controls = animate(y, 0, { type: 'spring', stiffness: 420, damping: 38 })
    return () => controls.stop()
  }, [metrics.maxDragPx, snap, y])

  const dragConstraints = useMemo(
    () => (snap === 'collapsed'
      ? { top: -metrics.maxDragPx, bottom: 0 }
      : { top: 0, bottom: metrics.maxDragPx }),
    [metrics.maxDragPx, snap],
  )

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (snap === 'collapsed') {
        const shouldExpand = info.velocity.y < -SNAP_VELOCITY || info.offset.y < -48
        onSnapChange(shouldExpand ? 'expanded' : 'collapsed')
        return
      }

      const shouldCollapse = info.velocity.y > SNAP_VELOCITY || info.offset.y > 48
      onSnapChange(shouldCollapse ? 'collapsed' : 'expanded')
    },
    [onSnapChange, snap],
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
        className={`fixed z-40 ${
          snap === 'collapsed'
            ? 'inset-x-3 mx-auto w-auto max-w-lg'
            : 'inset-0 w-full max-w-none'
        }`}
        style={{
          bottom: snap === 'collapsed'
            ? BOTTOM_OFFSET
            : hideBottomNav ? EXPANDED_BOTTOM_OFFSET : '0px',
          height: snap === 'collapsed' ? metrics.collapsedPx : metrics.expandedPx,
          y,
        }}
        drag="y"
        dragControls={dragControls}
        dragListener
        dragConstraints={dragConstraints}
        dragElastic={0.06}
        onDragEnd={handleDragEnd}
        layout
        transition={{ layout: { type: 'spring', stiffness: 380, damping: 36 } }}
      >
        <div className={`${snap === 'collapsed' ? 'mini-player-surface rounded-[1.15rem]' : 'map-glass-drawer rounded-none'} flex h-full flex-col overflow-hidden`}>
          {snap === 'expanded' && (
            <div
              className="flex shrink-0 cursor-grab flex-col items-center px-5 pt-3 active:cursor-grabbing"
              onPointerDown={(event) => dragControls.start(event)}
              onDoubleClick={() => onSnapChange('collapsed')}
            >
              <div className="mb-3 h-1 w-[3.125rem] rounded-sm bg-on-surface/80" aria-hidden="true" />
            </div>
          )}

          <LayoutGroup id="tour-player">
            <div className="min-h-0 flex-1 overflow-hidden">
              {snap === 'collapsed' ? (
                <div className="flex h-full flex-col px-3 py-2">{collapsed}</div>
              ) : (
                <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {expanded}
                </div>
              )}
            </div>
          </LayoutGroup>
        </div>
      </motion.aside>
    </>
  )
}
