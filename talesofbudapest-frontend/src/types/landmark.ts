export type LandmarkImage = {
  url: string
  alt?: string
}

export type Landmark = {
  id: string
  name: string
  lat: number
  lng: number
  story_prompt: string
  audio_url: string | null
  image_url: string | null
  images: LandmarkImage[]
}
