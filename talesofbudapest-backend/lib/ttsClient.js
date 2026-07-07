import { createSpeech } from './openRouterClient.js';

const STORAGE_BUCKET = 'audio-tours';

export const synthesizeSpeech = async (script) => createSpeech({ input: script });

export const uploadAudio = async (supabase, fileName, buffer) => {
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return urlData.publicUrl;
};
