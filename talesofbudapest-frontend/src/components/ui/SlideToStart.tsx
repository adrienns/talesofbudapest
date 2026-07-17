'use client'

import { ChevronRight } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

type SlideToStartProps = {
  onComplete: () => void
}

const THUMB_SIZE = 56
const EDGE_PADDING = 4

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

export const SlideToStart = ({ onComplete }: SlideToStartProps) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startOffset: number } | null>(null)
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const maximumOffset = () =>
    Math.max(0, (trackRef.current?.clientWidth ?? 0) - THUMB_SIZE - EDGE_PADDING * 2)

  const completeIfFarEnough = (nextOffset: number) => {
    if (nextOffset >= maximumOffset() * 0.72) {
      onComplete()
      return true
    }

    return false
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startOffset: offset }
    setIsDragging(true)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    setOffset(clamp(drag.startOffset + event.clientX - drag.startX, 0, maximumOffset()))
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    dragRef.current = null
    setIsDragging(false)
    const nextOffset = clamp(drag.startOffset + event.clientX - drag.startX, 0, maximumOffset())
    if (!completeIfFarEnough(nextOffset)) setOffset(0)
  }

  const cancelDrag = () => {
    dragRef.current = null
    setIsDragging(false)
    setOffset(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onComplete()
  }

  return (
    <div
      ref={trackRef}
      role="button"
      tabIndex={0}
      aria-label="Slide right to start exploring Budapest"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onKeyDown={onKeyDown}
      className="glass-surface relative mt-7 h-16 w-full touch-none select-none rounded-full p-1 outline-none transition focus-visible:ring-2 focus-visible:ring-white/90"
    >
      <span className="pointer-events-none absolute inset-0 grid place-items-center pl-12 text-sm font-bold tracking-wide text-on-surface/85">
        Slide to start
      </span>
      <span
        className={`pointer-events-none absolute left-1 top-1 grid h-14 w-14 place-items-center rounded-full bg-white/85 text-on-surface shadow-lg backdrop-blur-md ${isDragging ? '' : 'transition-transform duration-300 ease-out'}`}
        style={{ transform: `translateX(${offset}px)` }}
        aria-hidden="true"
      >
        <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
      </span>
    </div>
  )
}
