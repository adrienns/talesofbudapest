import L from 'leaflet'
import { getLandmarkInitial, getLandmarkMarkerImageUrl } from '@/lib/landmarkImage'
import type { MapPin } from '@/types/landmark'

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

const buildMarkerContent = (landmark: MapPin, isSelected: boolean): string => {
  const imageUrl = getLandmarkMarkerImageUrl(landmark)
  const initial = getLandmarkInitial(landmark.name)
  const selectedClass = isSelected ? ' photo-marker--selected' : ''
  const fallbackClass = imageUrl ? '' : ' photo-marker--fallback'

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
        class="photo-marker${fallbackClass}${selectedClass}"
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
      </div>
    </div>
  `
}

export const createLandmarkDotIcon = (isSelected: boolean) =>
  L.divIcon({
    className: 'landmark-dot-marker-icon',
    html: `
      <div class="landmark-dot-marker ${isSelected ? 'landmark-dot-marker--selected' : ''}">
        <span class="landmark-dot-marker__dot" aria-hidden="true"></span>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })

export const createLandmarkIcon = (landmark: MapPin, isSelected: boolean) => {
  const markerWidth = 100
  const anchorY = MARKER_SIZE + POINTER_OVERHANG
  const markerHeight = anchorY + 28

  return L.divIcon({
    className: 'landmark-photo-marker-icon',
    html: `
      <div class="landmark-photo-marker ${isSelected ? 'landmark-photo-marker--selected' : ''}">
        ${buildMarkerContent(landmark, isSelected)}
        <span class="landmark-photo-marker__label">${escapeHtml(truncateLabel(landmark.name))}</span>
      </div>
    `,
    iconSize: [markerWidth, markerHeight],
    iconAnchor: [markerWidth / 2, anchorY],
    popupAnchor: [0, -anchorY],
  })
}

export const createChapterIcon = (isSelected: boolean, chapterNumber: number) =>
  L.divIcon({
    className: '',
    html: `
      <div class="chapter-pin ${isSelected ? 'chapter-pin--selected' : ''}">
        <span class="chapter-pin__label">${chapterNumber}</span>
        <span class="chapter-pin__pulse"></span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  })
