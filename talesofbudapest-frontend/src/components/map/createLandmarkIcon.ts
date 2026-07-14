import L from 'leaflet'
import { getLandmarkInitial, getLandmarkMarkerImageUrl } from '@/lib/landmarkImage'
import type { MapPin } from '@/types/landmark'

type MarkerTheme = 'history' | 'architecture'
type MarkerVisual = Pick<MapPin, 'name' | 'image_url' | 'map_theme' | 'landmark_type'> & {
  images?: { url: string }[]
}

const markerTheme = (landmark: MarkerVisual): MarkerTheme =>
  landmark.map_theme ?? (['monument', 'statue', 'iconic'].includes(landmark.landmark_type ?? '') ? 'history' : 'architecture')

const MARKER_SIZE = 64
const POINTER_OVERHANG = 12
const LABEL_MAX_LENGTH = 22

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const escapeAttr = (value: string): string => escapeHtml(value).replace(/'/g, '&#39;')

const truncateLabel = (name: string): string =>
  name.length > LABEL_MAX_LENGTH ? `${name.slice(0, LABEL_MAX_LENGTH - 1)}…` : name

const buildMarkerContent = (landmark: MarkerVisual, isSelected: boolean, stopNumber?: number): string => {
  const imageUrl = getLandmarkMarkerImageUrl(landmark)
  const initial = getLandmarkInitial(landmark.name)
  const selectedClass = isSelected ? ' photo-marker--selected' : ''
  const fallbackClass = imageUrl ? '' : ' photo-marker--fallback'
  const themeClass = ` map-theme-${markerTheme(landmark)}`

  const imageMarkup = imageUrl
    ? `
      <img
        class="photo-marker__image"
        src="${escapeAttr(imageUrl)}"
        alt=""
        aria-hidden="true"
        referrerpolicy="no-referrer"
        loading="lazy"
        onerror="this.remove(); this.closest('.photo-marker').classList.add('photo-marker--fallback');"
      />
    `
    : ''

  return `
    <div class="photo-marker-shell">
      <div
        class="photo-marker${fallbackClass}${selectedClass}${themeClass}"
        role="img"
        aria-label="${escapeAttr(landmark.name)}"
      >
        <div class="photo-marker__circle">
          <div class="photo-marker__media">
            ${imageMarkup}
            <span class="photo-marker__initial">${escapeHtml(initial)}</span>
          </div>
        </div>
        <div class="photo-marker__pointer" aria-hidden="true"></div>
        ${stopNumber ? `<span class="photo-marker__stop-badge" aria-hidden="true">${stopNumber}</span>` : ''}
      </div>
    </div>
  `
}

export const createLandmarkDotIcon = (isSelected: boolean, theme: MarkerTheme = 'architecture') =>
  L.divIcon({
    className: 'landmark-dot-marker-icon',
    html: `
      <div class="landmark-dot-marker map-theme-${theme} ${isSelected ? 'landmark-dot-marker--selected' : ''}">
        <span class="landmark-dot-marker__dot" aria-hidden="true"></span>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })

export const createLandmarkIcon = (landmark: MarkerVisual, isSelected: boolean, stopNumber?: number) => {
  const markerWidth = 100
  const anchorY = MARKER_SIZE + POINTER_OVERHANG
  const markerHeight = anchorY + 28
  const theme = markerTheme(landmark)

  return L.divIcon({
    className: 'landmark-photo-marker-icon',
    html: `
      <div class="landmark-photo-marker map-theme-${theme} ${isSelected ? 'landmark-photo-marker--selected' : ''}">
        ${buildMarkerContent(landmark, isSelected, stopNumber)}
        <span class="landmark-photo-marker__label">${escapeHtml(truncateLabel(landmark.name))}</span>
      </div>
    `,
    iconSize: [markerWidth, markerHeight],
    iconAnchor: [markerWidth / 2, anchorY],
    popupAnchor: [0, -anchorY],
  })
}

export const createChapterIcon = (
  isSelected: boolean,
  chapter: { title: string; imageUrl?: string | null },
  stopNumber?: number,
) =>
  createLandmarkIcon({
    name: chapter.title,
    image_url: chapter.imageUrl ?? '/quick-start/parliement.webp',
    map_theme: 'history',
    landmark_type: 'monument',
  }, isSelected, stopNumber)
