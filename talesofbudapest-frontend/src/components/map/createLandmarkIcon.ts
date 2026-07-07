import L from 'leaflet'

export const createLandmarkIcon = (isSelected: boolean) =>
  L.divIcon({
    className: '',
    html: `
      <div class="landmark-pin ${isSelected ? 'landmark-pin--selected' : ''}">
        <span class="landmark-pin__dot"></span>
        <span class="landmark-pin__pulse"></span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })

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
