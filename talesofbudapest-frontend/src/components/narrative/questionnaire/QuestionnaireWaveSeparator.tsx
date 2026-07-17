type QuestionnaireWaveSeparatorProps = {
  label: string
}

export const QuestionnaireWaveSeparator = ({ label }: QuestionnaireWaveSeparatorProps) => (
  <div className="relative -mt-px h-20 overflow-hidden bg-[#cad9db]" aria-hidden="true">
    <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="block h-full w-full fill-[var(--color-ai-chat-bg)]">
      <path d="M0 76C180 76 260 20 480 20C660 20 690 90 840 90C990 90 1100 20 1360 20C1400 20 1420 22 1440 22V120H0Z" />
    </svg>
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/5 bg-white px-3 py-1 text-[0.625rem] font-bold tracking-[0.16em] text-on-surface/45 shadow-sm">{label}</span>
  </div>
)
