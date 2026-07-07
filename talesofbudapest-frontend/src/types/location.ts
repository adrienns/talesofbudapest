export type LocationRow = {
  id: string | number
  name: string
  latitude: number
  longitude: number
  story_prompt: string
  audio_url?: string | null
  image_url?: string | null
  images?: unknown
}
