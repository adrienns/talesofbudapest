import {
  mapLocationToLandmark,
  mapLocationToMapPin,
  type LocationRow,
  type MapPinRow,
} from '@/services/mappers/locationMapper'
import { isSupabaseConfigured, supabase } from '@/services/supabase'
import type { Landmark, MapPin } from '@/types'
import type { AppLocale } from '@/types/locale'
import { DEFAULT_LOCALE } from '@/types/locale'

const MAP_PIN_SELECT = `
  id,
  name,
  latitude,
  longitude,
  audio_url,
  image_url,
  source,
  landmark_type,
  importance_tier,
  importance_score,
  location_translations (locale, name, audio_url)
`

const DETAIL_SELECT = `
  id,
  name,
  latitude,
  longitude,
  story_prompt,
  audio_url,
  image_url,
  images,
  source,
  landmark_type,
  importance_tier,
  importance_score,
  location_translations (locale, name, story_prompt, audio_url)
`

export const getAllMapPins = async (locale: AppLocale = DEFAULT_LOCALE): Promise<MapPin[]> => {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('locations')
    .select(MAP_PIN_SELECT)
    .order('importance_score', { ascending: false, nullsFirst: false })
    .order('name')

  if (error) {
    throw new Error(error.message)
  }

  return (data as MapPinRow[]).map((row) => mapLocationToMapPin(row, locale))
}

export const getMapPinsInBbox = async (
  bbox: { south: number; west: number; north: number; east: number },
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<MapPin[]> => {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('locations')
    .select(MAP_PIN_SELECT)
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)
    .gte('longitude', bbox.west)
    .lte('longitude', bbox.east)
    .order('importance_score', { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    throw new Error(error.message)
  }

  return (data as MapPinRow[]).map((row) => mapLocationToMapPin(row, locale))
}

export const getLandmarkById = async (
  id: string,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<Landmark | null> => {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('locations')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    return null
  }

  return mapLocationToLandmark(data as LocationRow, locale)
}

/** @deprecated Use getAllMapPins for map display */
export const getAllLandmarks = async (locale: AppLocale = DEFAULT_LOCALE): Promise<Landmark[]> => {
  const pins = await getAllMapPins(locale)
  return pins.map((pin) => ({
    ...pin,
    story_prompt: '',
    images: pin.image_url ? [{ url: pin.image_url, alt: pin.name }] : [],
  }))
}
