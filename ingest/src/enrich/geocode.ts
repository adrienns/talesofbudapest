import axios from 'axios'
import type { GeocodeStatus } from '../types/mapAnchor.js'
import { USER_AGENT } from '../scraper/constants.js'

export type GeocodeResult = {
  lat: number | null
  lng: number | null
  geocodeStatus: GeocodeStatus
  geocodeQuery: string
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export const buildGeocodeQuery = (address: string): string =>
  `${address}, Budapest, Hungary`

export const geocodeAddress = async (address: string): Promise<GeocodeResult> => {
  const geocodeQuery = buildGeocodeQuery(address)

  try {
    const response = await axios.get<
      Array<{ lat: string; lon: string; display_name: string }>
    >(NOMINATIM_URL, {
      params: {
        q: geocodeQuery,
        format: 'json',
        limit: 1,
        countrycodes: 'hu',
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 15_000,
    })

    const first = response.data[0]
    if (!first) {
      return {
        lat: null,
        lng: null,
        geocodeStatus: 'failed',
        geocodeQuery,
      }
    }

    return {
      lat: Number(first.lat),
      lng: Number(first.lon),
      geocodeStatus: 'ok',
      geocodeQuery,
    }
  } catch {
    return {
      lat: null,
      lng: null,
      geocodeStatus: 'failed',
      geocodeQuery,
    }
  }
}
