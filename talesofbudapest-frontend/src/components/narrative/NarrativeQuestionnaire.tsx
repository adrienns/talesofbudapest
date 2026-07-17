"use client";

import {
  ArrowUp,
  Check,
  ChevronLeft,
  Footprints,
  MapPin,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { QuickStartTourCarousel } from "@/components/narrative/QuickStartTourCarousel";
import { TourDetailView } from "@/components/narrative/TourDetailView";
import { IconButton } from "@/components/ui/IconButton";
import {
  CURATED_STARTERS,
  DEFAULT_TOUR_MINUTES,
  MAX_TOPICS,
  TOPIC_COLORS,
  TOUR_DURATIONS,
  TOUR_STYLES,
  TOUR_TOPICS,
  formatMinutesShort,
  type CuratedStarter,
  type TourStyle,
} from "@/constants/questionnaire";

export type QuestionnaireExtras = {
  timeBudgetMinutes: number;
  styleId: string;
  topicIds: string[];
  nearMe: boolean;
  intent?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onPlan: (extras: QuestionnaireExtras) => void;
  onStartCurated: (
    starter: CuratedStarter,
    initialChapterIndex?: number,
  ) => void;
  onRequestLocation: () => Promise<boolean>;
  locationStatus: "idle" | "requesting" | "ready" | "denied" | "unavailable";
  focusInput?: boolean;
};

type Step = "shape" | "interests";
const optionStyle = (index: number): CSSProperties => ({
  backgroundColor: `var(${TOPIC_COLORS[index % TOPIC_COLORS.length]})`,
  animationDelay: `${index * 45}ms`,
});

const QuestionnaireWaveSeparator = ({ label }: { label: string }) => (
  <div
    className="relative -mt-px h-20 overflow-hidden bg-[#cad9db]"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className="block h-full w-full fill-[var(--color-ai-chat-bg)]"
    >
      <path d="M0 76C180 76 260 20 480 20C660 20 690 90 840 90C990 90 1100 20 1360 20C1400 20 1420 22 1440 22V120H0Z" />
    </svg>
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/5 bg-white px-3 py-1 text-[0.625rem] font-bold tracking-[0.16em] text-on-surface/45 shadow-sm">
      {label}
    </span>
  </div>
);

export const NarrativeQuestionnaire = ({
  isOpen,
  onClose,
  onPlan,
  onStartCurated,
  onRequestLocation,
  locationStatus,
  focusInput = false,
}: Props) => {
  const t = useTranslations("questionnaire");
  const [step, setStep] = useState<Step>("shape");
  const [style, setStyle] = useState<TourStyle | null>(null);
  const [minutes, setMinutes] = useState(DEFAULT_TOUR_MINUTES);
  const [nearMe, setNearMe] = useState(false);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [intent, setIntent] = useState("");
  const [selectedCuratedTour, setSelectedCuratedTour] =
    useState<CuratedStarter | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const topics = TOUR_TOPICS.filter((topic) => topicIds.includes(topic.id));

  useEffect(() => {
    if (!isOpen) {
      setStep("shape");
      setStyle(null);
      setMinutes(DEFAULT_TOUR_MINUTES);
      setNearMe(false);
      setTopicIds([]);
      setIntent("");
      setSelectedCuratedTour(null);
    }
  }, [isOpen]);
  useEffect(() => {
    if (isOpen && focusInput && step === "interests") inputRef.current?.focus();
  }, [focusInput, isOpen, step]);
  useEffect(() => {
    if (locationStatus !== "ready") setNearMe(false);
  }, [locationStatus]);

  const toggleNearMe = useCallback(async () => {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    const granted = await onRequestLocation();
    setNearMe(granted);
  }, [nearMe, onRequestLocation]);
  const toggleTopic = useCallback(
    (id: string) =>
      setTopicIds((current) => {
        if (current.includes(id)) return current.filter((item) => item !== id);
        return current.length >= MAX_TOPICS
          ? [...current.slice(1), id]
          : [...current, id];
      }),
    [],
  );
  const start = useCallback(() => {
    if (!style || (!topics.length && !intent.trim())) return;
    onPlan({
      timeBudgetMinutes: minutes,
      styleId: style.id,
      topicIds,
      nearMe,
      intent: intent.trim() || undefined,
    });
  }, [intent, minutes, nearMe, onPlan, style, topicIds, topics]);

  if (!isOpen) return null;
  const quickStartTours = CURATED_STARTERS.map((item) =>
    item.kind === "fixed"
      ? {
          slug: item.slug,
          title: t(item.titleKey),
          tagline: t(item.taglineKey),
          imageSrc: item.imageSrc,
          imageAlt: t(item.imageAltKey),
        }
      : item,
  );
  const canCreate = Boolean(style && (topics.length || intent.trim()));
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-ai-chat-bg)] animate-ai-chat-enter motion-reduce:animate-none"
    >
      <header
        className={`flex items-center justify-between px-4 pt-[max(0.875rem,env(safe-area-inset-top))] ${step === "shape" ? "bg-[#cad9db]" : "bg-[var(--color-ai-chat-bg)]"}`}
      >
        <IconButton
          icon={ChevronLeft}
          onClick={onClose}
          ariaLabel={t("close")}
          size="lg"
        />
        <div className="flex gap-1.5" aria-hidden="true">
          <span
            className={`h-1.5 rounded-full ${step === "shape" ? "w-6 bg-[var(--map-teal)]" : "w-1.5 bg-on-surface/20"}`}
          />
          <span
            className={`h-1.5 rounded-full ${step === "interests" ? "w-6 bg-[var(--map-teal)]" : "w-1.5 bg-on-surface/20"}`}
          />
        </div>
        <div></div>
      </header>
      <main className="flex-1 overflow-y-auto bg-[var(--color-ai-chat-bg)] px-5 py-6">
        {step === "shape" && (
          <div className="-mx-5 -my-6 flex min-h-full flex-col">
            <section className="bg-[#cad9db] px-5 pb-7 pt-6">
              <div className="mx-auto max-w-md">
                <h2 className="mb-4 text-xl font-extrabold text-slate-800">
                  {t("readyMadeTours")}
                </h2>
                <QuickStartTourCarousel
                  tours={quickStartTours}
                  onSelect={(slug) => {
                    const item = CURATED_STARTERS.find(
                      (candidate) => candidate.slug === slug,
                    );
                    if (item) setSelectedCuratedTour(item);
                  }}
                />
              </div>
            </section>
            <QuestionnaireWaveSeparator label={t("or")} />
            <section className="flex-1 bg-[var(--color-ai-chat-bg)] px-5 pb-8 pt-1">
              <div className="mx-auto flex max-w-md flex-col gap-7">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-on-surface">
                    {t("styleQuestion")}
                  </h2>
                  <p className="mt-1 text-sm text-on-surface/55">
                    {t("styleHelper")}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {TOUR_STYLES.map((item, index) => {
                    const Icon = item.icon;
                    const selected = style?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setStyle(item)}
                        style={optionStyle(index)}
                        aria-pressed={selected}
                        className={`aspect-square min-w-0 overflow-hidden rounded-2xl px-2 py-3 text-center text-white shadow-sm ${selected ? "ring-2 ring-on-surface ring-offset-2" : ""}`}
                      >
                        <span className="flex h-full flex-col items-center justify-center gap-2">
                          <span className="rounded-full bg-white/20 p-2">
                            <Icon className="h-5 w-5" />
                          </span>
                          <span className="min-w-0">
                            <b className="block text-xs leading-tight sm:text-sm">
                              {item.label}
                            </b>
                            <span className="mt-1 block text-[0.625rem] leading-tight text-white/75 sm:text-xs">
                              {item.blurb}
                            </span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-bold text-on-surface">
                      {t("durationQuestion")}
                    </h3>
                    <span className="q-duration-chip rounded-full px-3 py-1 text-sm font-bold">
                      {formatMinutesShort(minutes)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={TOUR_DURATIONS.length - 1}
                    step="1"
                    value={TOUR_DURATIONS.indexOf(
                      minutes as (typeof TOUR_DURATIONS)[number],
                    )}
                    onChange={(event) =>
                      setMinutes(TOUR_DURATIONS[Number(event.target.value)])
                    }
                    className="w-full accent-[var(--map-teal)]"
                    aria-label={t("durationQuestion")}
                  />
                  <div className="mt-2 flex justify-between text-xs text-on-surface/55">
                    {TOUR_DURATIONS.map((value) => (
                      <span key={value}>{formatMinutesShort(value)}</span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-on-surface/60">
                    {t("durationHint", {
                      minutes: formatMinutesShort(minutes),
                    })}
                  </p>
                </section>
                <button
                  type="button"
                  onClick={() => void toggleNearMe()}
                  disabled={locationStatus === "requesting"}
                  aria-pressed={nearMe}
                  className={`mx-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${nearMe ? "bg-[var(--map-teal)] text-white" : "glass-surface text-on-surface/70"}`}
                >
                  <MapPin className="h-4 w-4" />
                  {locationStatus === "requesting"
                    ? t("locationRequesting")
                    : t("startNearMe")}
                </button>
                <button
                  type="button"
                  disabled={!style}
                  onClick={() => setStep("interests")}
                  className="q-start-btn rounded-full py-3.5 font-bold text-white disabled:opacity-35"
                >
                  {t("continue")}
                </button>
              </div>
            </section>
          </div>
        )}
        {step === "interests" && (
          <div className="-mx-5 -my-6 flex min-h-full bg-[var(--color-ai-chat-bg)] px-5 py-8">
            <div className="q-bubble-in mx-auto flex w-full max-w-md flex-col gap-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold text-on-surface">
                  {t("topicsQuestion")}
                </h2>
                <p className="mt-1 text-sm text-on-surface/55">
                  {t("topicsHelper", { max: MAX_TOPICS })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TOUR_TOPICS.map((topic, index) => {
                  const Icon = topic.icon;
                  const selected = topicIds.includes(topic.id);
                  return (
                    <button
                      type="button"
                      key={topic.id}
                      onClick={() => toggleTopic(topic.id)}
                      aria-pressed={selected}
                      style={optionStyle(index)}
                      className={`relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-white shadow-sm transition active:scale-95 ${selected ? "ring-2 ring-on-surface ring-offset-2" : "opacity-90"}`}
                    >
                      {selected ? (
                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/25">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span className="text-xs font-bold leading-tight">
                        {topic.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-bold text-on-surface">
                  {t("intentLabel")}
                </span>
                <div className="prompt-bar-glass flex items-center gap-3 rounded-2xl px-4 py-3">
                  <input
                    ref={inputRef}
                    value={intent}
                    onChange={(event) => setIntent(event.target.value)}
                    placeholder={t("intentPlaceholder")}
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
                  <ArrowUp className="h-4 w-4 text-accent" />
                </div>
              </label>
              <button
                type="button"
                onClick={start}
                disabled={!canCreate}
                className="q-start-btn mt-2 flex items-center justify-center gap-2 rounded-full py-4 font-bold text-white disabled:opacity-35"
              >
                <Footprints className="h-5 w-5" />
                {t("startTour")}
              </button>
            </div>
          </div>
        )}
      </main>
      {selectedCuratedTour && (
        <TourDetailView
          starter={selectedCuratedTour}
          title={
            selectedCuratedTour.kind === "fixed"
              ? t(selectedCuratedTour.titleKey)
              : selectedCuratedTour.title
          }
          onClose={() => setSelectedCuratedTour(null)}
          onStart={(index) => onStartCurated(selectedCuratedTour, index)}
        />
      )}
    </div>
  );
};
