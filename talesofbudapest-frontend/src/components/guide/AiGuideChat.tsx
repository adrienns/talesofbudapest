'use client'

import { ArrowUp, BookOpen, Footprints, Loader2, MapPin, MessageCircle, RotateCcw, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import { useGuideStore } from '@/stores/guideStore'
import type { GuideChatContext } from '@/types/guide'

type AiGuideChatProps = {
  isOpen: boolean
  context: GuideChatContext
  onClose: () => void
  onShowLandmark: (landmarkId: string) => void
  onCreateTour: (intent: string) => void
}

export const AiGuideChat = ({
  isOpen,
  context,
  onClose,
  onShowLandmark,
  onCreateTour,
}: AiGuideChatProps) => {
  const t = useTranslations('guide')
  const { messages, isLoading, error, send, retry, reset } = useGuideStore()
  const [value, setValue] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestions = [t('suggestionOne'), t('suggestionTwo'), t('suggestionThree')]

  useEffect(() => {
    if (!isOpen) return
    inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [isLoading, isOpen, messages])

  if (!isOpen) return null

  const submit = (message = value) => {
    const trimmed = message.trim()
    if (!trimmed || isLoading) return
    setValue('')
    void send(trimmed, context)
  }

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-ai-chat-bg)] animate-ai-chat-enter motion-reduce:animate-none"
    >
      <header className="flex items-center gap-3 border-b border-outline-variant/25 bg-surface/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white">
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-lg font-bold text-on-surface">{t('title')}</h1>
          <p className="text-xs text-on-surface/50">{t('subtitle')}</p>
        </div>
        <button type="button" onClick={reset} aria-label={t('newConversation')} className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface/65">
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        </button>
        <button type="button" onClick={onClose} aria-label={t('close')} className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          {messages.length === 0 && (
            <div className="rounded-3xl bg-surface p-5 shadow-sm">
              <div className="flex items-center gap-2 text-accent">
                <BookOpen className="h-5 w-5" aria-hidden="true" />
                <p className="font-bold">{t('welcomeTitle')}</p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-on-surface/65">{t('welcomeBody')}</p>
              <div className="mt-5 flex flex-col gap-2">
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => submit(suggestion)} className="rounded-2xl border border-outline-variant/40 px-4 py-3 text-left text-sm font-semibold text-on-surface transition active:scale-[0.99]">
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <article key={message.id} className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${message.role === 'user' ? 'ml-auto bg-accent text-white' : 'mr-auto bg-surface text-on-surface shadow-sm'}`}>
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.sources && message.sources.length > 0 && (
                <div className="mt-4 border-t border-outline-variant/30 pt-3">
                  <p className="mb-2 text-[0.68rem] font-bold uppercase tracking-wider text-on-surface/45">{t('sources')}</p>
                  <div className="flex flex-col gap-1.5">
                    {message.sources.map((source) => (
                      <button key={source.landmarkId} type="button" onClick={() => onShowLandmark(source.landmarkId)} className="flex items-center gap-2 rounded-xl bg-surface-dim/60 px-3 py-2 text-left text-xs font-semibold text-on-surface">
                        <MapPin className="h-4 w-4 text-accent" aria-hidden="true" />
                        <span className="truncate">{source.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.actions.map((action) => (
                    <button
                      key={`${action.type}-${action.type === 'show_landmark' ? action.landmarkId : action.intent}`}
                      type="button"
                      onClick={() => action.type === 'show_landmark' ? onShowLandmark(action.landmarkId) : onCreateTour(action.intent)}
                      className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-2 text-xs font-bold text-accent"
                    >
                      {action.type === 'show_landmark' ? <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> : <Footprints className="h-3.5 w-3.5" aria-hidden="true" />}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}

          {isLoading && (
            <div className="mr-auto flex items-center gap-2 rounded-3xl bg-surface px-4 py-3 text-sm text-on-surface/55 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('thinking')}
            </div>
          )}
          {error && (
            <div className="mr-auto rounded-2xl border border-accent/25 bg-surface px-4 py-3 text-sm text-on-surface">
              <p>{t('error')}</p>
              <button type="button" onClick={() => void retry()} className="mt-2 font-bold text-accent">{t('retry')}</button>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <form onSubmit={(event) => { event.preventDefault(); submit() }} className="border-t border-outline-variant/25 bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto flex max-w-xl items-center gap-2 rounded-full border border-outline-variant/50 bg-background px-4 py-2 shadow-sm">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value.slice(0, 500))}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            maxLength={500}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-on-surface outline-none placeholder:text-on-surface/40"
          />
          <button type="submit" disabled={!value.trim() || isLoading} aria-label={t('send')} className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-white disabled:opacity-35">
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </section>
  )
}
