import ffmpegPath from 'ffmpeg-static';
import { randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export const CURATED_MUSIC_CUE_SECONDS = 10;
export const CURATED_MUSIC_FADE_SECONDS = 1.5;
// 0.0631 is -24 dB, leaving at least 12 dB of practical headroom beneath narration.
export const CURATED_MUSIC_VOLUME = 0.0631;

const resolvedAssetPath = (musicAsset) => {
  if (!musicAsset?.localFileUrl) throw new Error('Curated music asset has no local file');
  return musicAsset.localFileUrl instanceof URL
    ? fileURLToPath(musicAsset.localFileUrl)
    : musicAsset.localFileUrl;
};

export const buildCuratedMusicFilter = ({
  cueSeconds = CURATED_MUSIC_CUE_SECONDS,
  fadeSeconds = CURATED_MUSIC_FADE_SECONDS,
  volume = CURATED_MUSIC_VOLUME,
} = {}) => {
  const safeCueSeconds = Math.max(cueSeconds, fadeSeconds * 2);
  const fadeStart = safeCueSeconds - fadeSeconds;
  return [
    `[0:a]atrim=duration=${safeCueSeconds},asetpts=PTS-STARTPTS,volume=${volume}[music-bed]`,
    `[music-bed]afade=t=in:st=0:d=${fadeSeconds},afade=t=out:st=${fadeStart}:d=${fadeSeconds}[music]`,
    '[1:a]asetpts=PTS-STARTPTS[voice]',
    '[voice][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]',
  ].join(';');
};

/**
 * Pre-mixes a short CC0 music cue into narration. The music ends before the
 * visitor receives walking directions, so the player can keep serving one MP3.
 */
export const mixCuratedNarrationAudio = async ({
  narrationBuffer,
  musicAsset,
  enabled = true,
  execFileFn = execFile,
}) => {
  if (!enabled || !musicAsset) return narrationBuffer;
  if (!Buffer.isBuffer(narrationBuffer) || narrationBuffer.length === 0) {
    throw new Error('Narration audio is required before music can be mixed');
  }
  if (!ffmpegPath) throw new Error('ffmpeg-static is unavailable for curated music mixing');

  const prefix = join(tmpdir(), `tales-curated-mix-${randomUUID()}`);
  const narrationPath = `${prefix}-narration.mp3`;
  const outputPath = `${prefix}-mixed.mp3`;
  const musicPath = resolvedAssetPath(musicAsset);

  try {
    await writeFile(narrationPath, narrationBuffer);
    await execFileFn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-stream_loop', '-1', '-i', musicPath,
      '-i', narrationPath,
      '-filter_complex', buildCuratedMusicFilter(),
      '-map', '[mixed]', '-map_metadata', '-1',
      '-c:a', 'libmp3lame', '-b:a', '128k',
      outputPath,
    ]);
    const mixed = await readFile(outputPath);
    if (!mixed.length) throw new Error('Curated music mix produced an empty MP3');
    return mixed;
  } finally {
    await Promise.all([
      unlink(narrationPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
};
