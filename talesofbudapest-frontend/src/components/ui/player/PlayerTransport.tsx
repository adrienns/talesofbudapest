"use client";

import {
  Loader2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { PrimaryActionButton } from "@/components/ui/PrimaryActionButton";

type PlayerTransportProps = {
  isPlaying: boolean;
  hasAudio: boolean;
  isGenerating?: boolean;
  canRequestAudio?: boolean;
  onPlayPause: () => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
  onRewind?: () => void;
  onFastForward?: () => void;
  readyGlow?: boolean;
  /** Connects the mini-player and full-player primary controls during expansion. */
  playLayoutId?: string;
  size?: "sm" | "lg";
  /** 'onImage' lightens controls for imagery; 'tourSheet' uses the warm map accent. */
  tone?: "surface" | "onImage" | "tourSheet" | "tourAudioSheet";
};

export const PlayerTransport = ({
  isPlaying,
  hasAudio,
  isGenerating = false,
  canRequestAudio = false,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onRewind,
  onFastForward,
  readyGlow = false,
  playLayoutId,
  size = "sm",
  tone = "surface",
}: PlayerTransportProps) => {
  const t = useTranslations("player");
  const canPlay = hasAudio || canRequestAudio;
  const playLabel = isGenerating
    ? t("generatingAudioTour")
    : isPlaying
      ? t("pause")
      : t("play");

  const isLarge = size === "lg";
  const sideBtn = isLarge ? "h-12 w-12" : "h-9 w-9";
  const sideIcon = isLarge ? "h-6 w-6" : "h-[1.125rem] w-[1.125rem]";
  const playBtn = isLarge ? "h-20 w-20" : "h-14 w-14";
  const playIcon = isLarge ? "h-7 w-7" : "h-5 w-5";
  const sideColor =
    tone === "onImage"
      ? "text-white/85"
      : tone === "tourSheet"
        ? "text-[var(--map-orange)]"
        : "text-accent/55";

  if ((tone === "tourSheet" && isLarge) || tone === "tourAudioSheet") {
    const isTourAudioSheet = tone === "tourAudioSheet";
    const isCompactTourAudioSheet = isTourAudioSheet && !isLarge;
    const transportButton = isTourAudioSheet
      ? `flex ${isCompactTourAudioSheet ? "h-6 w-8 text-[var(--map-text)]" : "h-10 w-10 text-[#272522]"} items-center justify-center transition active:scale-95 disabled:opacity-30`
      : "flex h-12 w-12 items-center justify-center rounded-full bg-[#f7efd9] text-[var(--map-orange)] shadow-[0_4px_10px_rgba(99,69,39,0.14),inset_1px_1px_3px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(124,87,48,0.1)] transition active:scale-95 disabled:opacity-30";

    return (
      <div
        className={`flex shrink-0 items-center justify-between ${isCompactTourAudioSheet ? "gap-5" : "gap-1"}`}
      >
        <button
          type="button"
          onClick={isTourAudioSheet ? onRewind : onSkipBack}
          disabled={isTourAudioSheet ? !onRewind : !onSkipBack}
          aria-label={isTourAudioSheet ? "Rewind 10 seconds" : t("previousChapter")}
          className={`${transportButton} ${isTourAudioSheet ? "relative" : ""}`}
        >
          {isTourAudioSheet ? (
            <>
              <RotateCcw
                className={`${isCompactTourAudioSheet ? "h-[1.35rem] w-[1.35rem]" : "h-6 w-6"}`}
                strokeWidth={1.9}
                aria-hidden="true"
              />
              <span className="pointer-events-none absolute text-[0.5rem] font-bold leading-none">
                10
              </span>
            </>
          ) : (
            <SkipBack
              className={`${isCompactTourAudioSheet ? "h-4 w-4" : "h-6 w-6"} fill-current`}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          )}
        </button>
        {isTourAudioSheet ? (
          <motion.div
            layoutId={playLayoutId}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <button
              type="button"
              onClick={onPlayPause}
              disabled={!canPlay || isGenerating}
              aria-label={playLabel}
              className={
                isCompactTourAudioSheet
                  ? "flex h-6 w-10 items-center justify-center bg-transparent text-[var(--map-text)] transition active:scale-95 disabled:opacity-40"
                  : `flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-[#272522] text-[#fff8e8] shadow-[0_6px_14px_rgba(34,31,27,0.2)] transition active:scale-95 disabled:opacity-40 ${readyGlow ? "play-ready-glow" : ""}`
              }
            >
              {isGenerating ? (
                <Loader2
                  className={`${isCompactTourAudioSheet ? "h-6 w-6" : "h-6 w-6"} animate-spin`}
                  aria-hidden="true"
                />
              ) : isPlaying ? (
                <Pause
                  className={`${isCompactTourAudioSheet ? "h-6 w-6" : "h-6 w-6"} fill-current`}
                  aria-hidden="true"
                />
              ) : (
                <Play
                  className={`ml-0.5 ${isCompactTourAudioSheet ? "h-6 w-6" : "h-6 w-6"} fill-current`}
                  aria-hidden="true"
                />
              )}
            </button>
          </motion.div>
        ) : (
          <motion.div
            layoutId={playLayoutId}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <PrimaryActionButton
              onClick={onPlayPause}
              disabled={!canPlay || isGenerating}
              aria-label={playLabel}
              readyGlow={readyGlow}
              className="flex h-16 w-16 items-center justify-center"
            >
              {isGenerating ? (
                <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              ) : isPlaying ? (
                <Pause className="h-6 w-6 fill-current" aria-hidden="true" />
              ) : (
                <Play
                  className="ml-0.5 h-6 w-6 fill-current"
                  aria-hidden="true"
                />
              )}
            </PrimaryActionButton>
          </motion.div>
        )}
        <button
          type="button"
          onClick={isTourAudioSheet ? onFastForward : onSkipForward}
          disabled={isTourAudioSheet ? !onFastForward : !onSkipForward}
          aria-label={
            isTourAudioSheet ? "Fast forward 10 seconds" : t("nextChapter")
          }
          className={`${transportButton} ${isTourAudioSheet ? "relative" : ""}`}
        >
          {isTourAudioSheet ? (
            <>
              <RotateCw
                className={`${isCompactTourAudioSheet ? "h-[1.35rem] w-[1.35rem]" : "h-6 w-6"}`}
                strokeWidth={1.9}
                aria-hidden="true"
              />
              <span className="pointer-events-none absolute text-[0.5rem] font-bold leading-none">
                10
              </span>
            </>
          ) : (
            <SkipForward
              className={`${isCompactTourAudioSheet ? "h-4 w-4" : "h-6 w-6"} fill-current`}
              strokeWidth={1.8}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center ${isLarge ? "gap-6" : "gap-0.5"}`}
    >
      <button
        type="button"
        onClick={onSkipBack}
        disabled={!onSkipBack}
        aria-label={t("previousChapter")}
        className={`flex ${sideBtn} items-center justify-center ${sideColor} transition active:scale-95 disabled:opacity-30`}
      >
        <SkipBack className={sideIcon} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <PrimaryActionButton
        onClick={onPlayPause}
        disabled={!canPlay || isGenerating}
        aria-label={playLabel}
        readyGlow={readyGlow}
        className={`flex ${playBtn} items-center justify-center`}
      >
        {isGenerating ? (
          <Loader2 className={`${playIcon} animate-spin`} aria-hidden="true" />
        ) : isPlaying ? (
          <Pause className={`${playIcon} fill-current`} aria-hidden="true" />
        ) : (
          <Play
            className={`ml-0.5 ${playIcon} fill-current`}
            aria-hidden="true"
          />
        )}
      </PrimaryActionButton>

      <button
        type="button"
        onClick={onSkipForward}
        disabled={!onSkipForward}
        aria-label={t("nextChapter")}
        className={`flex ${sideBtn} items-center justify-center ${sideColor} transition active:scale-95 disabled:opacity-30`}
      >
        <SkipForward
          className={sideIcon}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
    </div>
  );
};
