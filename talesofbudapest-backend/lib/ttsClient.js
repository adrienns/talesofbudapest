import { Mp3Encoder } from '@breezystack/lamejs';
import { createSpeech, GEMINI_TTS_PCM_CHANNELS, GEMINI_TTS_PCM_SAMPLE_RATE } from './openRouterClient.js';
import { createGeminiSpeech } from './geminiTtsClient.js';
import { prepareSpeechText } from './prepareSpeechText.js';
import { chunkTextForTts } from './ttsChunking.js';
import { DEFAULT_LOCALE } from './locale.js';

const STORAGE_BUCKET = 'audio-tours';

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
};

/** LAME encodes in frames of 1152 samples — the standard MP3 block size. */
const MP3_SAMPLE_BLOCK_SIZE = 1152;
const MP3_BITRATE_KBPS = 128;

/**
 * Encodes headerless 16-bit PCM to MP3 with lamejs (pure JS, no native/ffmpeg
 * dependency). Chromium's `<audio>` element has a much more limited, less
 * reliable WAV demuxer than its MP3 support, so raw PCM/WAV is not safe to
 * serve directly even though it's a structurally valid file — verified by
 * testing an identical WAV in headless Chrome, which rejected it with
 * MEDIA_ERR_SRC_NOT_SUPPORTED while an old real MP3 from the same server
 * played back fine.
 */
export const pcmToMp3 = (
  pcm,
  { sampleRate = GEMINI_TTS_PCM_SAMPLE_RATE, channels = GEMINI_TTS_PCM_CHANNELS } = {},
) => {
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
  const encoder = new Mp3Encoder(channels, sampleRate, MP3_BITRATE_KBPS);
  const chunks = [];

  for (let i = 0; i < samples.length; i += MP3_SAMPLE_BLOCK_SIZE) {
    const block = samples.subarray(i, i + MP3_SAMPLE_BLOCK_SIZE);
    const encoded = encoder.encodeBuffer(block);
    if (encoded.length > 0) {
      chunks.push(Buffer.from(encoded));
    }
  }

  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) {
    chunks.push(Buffer.from(finalChunk));
  }

  return Buffer.concat(chunks);
};

/** Returns `{ buffer, contentType }` — headerless PCM is transcoded to MP3; already-encoded formats pass through. */
export const synthesizeSpeech = async (script, locale = DEFAULT_LOCALE, options = {}) => {
  const { speechLexicon = [], provider = 'openrouter', voice } = options;
  const { speechText } = prepareSpeechText(script, locale, speechLexicon);
  const chunks = chunkTextForTts(speechText);

  if (!chunks.length) {
    throw new Error('TTS input text is empty');
  }

  const pcmBuffers = [];
  const speechCreator = getTtsSpeechCreator(provider);

  for (const chunk of chunks) {
    const { buffer, format } = await speechCreator({ input: chunk, locale, ...(voice ? { voice } : {}) });
    if (format !== 'pcm') {
      return { buffer, contentType: CONTENT_TYPES[format] ?? CONTENT_TYPES.mp3 };
    }
    pcmBuffers.push(buffer);
  }

  const combined = Buffer.concat(pcmBuffers);
  return { buffer: pcmToMp3(combined), contentType: CONTENT_TYPES.mp3 };
};

export const getTtsSpeechCreator = (provider = 'openrouter') => {
  if (provider === 'openrouter') return createSpeech;
  if (provider === 'gemini') return createGeminiSpeech;
  throw new Error(`Unsupported TTS provider: ${provider}`);
};

export const uploadAudio = async (supabase, fileName, buffer, contentType = CONTENT_TYPES.mp3) => {
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
};
