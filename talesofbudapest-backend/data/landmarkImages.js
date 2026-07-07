/** @typedef {{ url: string, alt?: string }} LandmarkImage */

/** @type {Record<string, { image_url: string, images: LandmarkImage[] }>} */
export const LANDMARK_MEDIA = {
  'Hungarian Parliament Building': {
    image_url: '/landmarks/parliament.jpg',
    images: [
      {
        url: '/landmarks/parliament.jpg',
        alt: 'Hungarian Parliament Building from across the Danube',
      },
    ],
  },
  'Buda Castle': {
    image_url: '/landmarks/buda-castle.jpg',
    images: [
      {
        url: '/landmarks/buda-castle.jpg',
        alt: 'Buda Castle on Castle Hill',
      },
    ],
  },
  "Fisherman's Bastion": {
    image_url: '/landmarks/fishermans-bastion.jpg',
    images: [
      {
        url: '/landmarks/fishermans-bastion.jpg',
        alt: "Fisherman's Bastion terraces",
      },
    ],
  },
  "St. Stephen's Basilica": {
    image_url: '/landmarks/st-stephens-basilica.jpg',
    images: [
      {
        url: '/landmarks/st-stephens-basilica.jpg',
        alt: "St. Stephen's Basilica facade",
      },
    ],
  },
};

export const withLandmarkMedia = (landmark) => {
  const media = LANDMARK_MEDIA[landmark.name] ?? { image_url: null, images: [] };

  return {
    ...landmark,
    image_url: media.image_url,
    images: media.images,
  };
};
