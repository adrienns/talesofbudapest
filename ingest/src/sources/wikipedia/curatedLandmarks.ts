export type CuratedLandmark = {
  qId: string
  wikiTitle: string
  landmarkType: 'iconic' | 'building' | 'monument' | 'statue'
}

export const BUDAPEST_LANDMARKS: CuratedLandmark[] = [
  { qId: 'Q11819', wikiTitle: 'Hungarian Parliament Building', landmarkType: 'iconic' },
  { qId: 'Q46313', wikiTitle: 'Buda Castle', landmarkType: 'iconic' },
  { qId: 'Q493117', wikiTitle: "Fisherman's Bastion", landmarkType: 'iconic' },
  { qId: 'Q338665', wikiTitle: "St. Stephen's Basilica", landmarkType: 'iconic' },
  { qId: 'Q248823', wikiTitle: "Heroes' Square", landmarkType: 'iconic' },
  { qId: 'Q465534', wikiTitle: 'Széchenyi Chain Bridge', landmarkType: 'iconic' },
  { qId: 'Q194783', wikiTitle: 'Széchenyi thermal bath', landmarkType: 'building' },
  { qId: 'Q754397', wikiTitle: 'Dohány Street Synagogue', landmarkType: 'building' },
  { qId: 'Q36833', wikiTitle: 'Hungarian State Opera House', landmarkType: 'building' },
  { qId: 'Q493133', wikiTitle: 'Matthias Church', landmarkType: 'building' },
  { qId: 'Q1092030', wikiTitle: 'Vajdahunyad Castle', landmarkType: 'building' },
  { qId: 'Q914141', wikiTitle: 'Hungarian National Museum', landmarkType: 'building' },
  { qId: 'Q609160', wikiTitle: 'Great Market Hall (Budapest)', landmarkType: 'building' },
  { qId: 'Q897824', wikiTitle: 'Rudas Thermal Bath and Swimming Pool', landmarkType: 'building' },
  { qId: 'Q916120', wikiTitle: 'Margaret Bridge', landmarkType: 'monument' },
  { qId: 'Q915195', wikiTitle: 'Liberty Bridge', landmarkType: 'monument' },
  { qId: 'Q699098', wikiTitle: 'Elisabeth Bridge', landmarkType: 'monument' },
  { qId: 'Q372376', wikiTitle: 'House of Terror Museum', landmarkType: 'building' },
  { qId: 'Q265058', wikiTitle: 'Hungarian Academy of Sciences', landmarkType: 'building' },
  { qId: 'Q209884', wikiTitle: 'Museum of Fine Arts, Budapest', landmarkType: 'building' },
  { qId: 'Q206170', wikiTitle: 'Citadella', landmarkType: 'monument' },
  { qId: 'Q577122', wikiTitle: 'Gellért Hill', landmarkType: 'monument' },
  { qId: 'Q473811', wikiTitle: 'Shoes on the Danube Bank', landmarkType: 'monument' },
  { qId: 'Q1296555', wikiTitle: 'Thermes Szent Lukács', landmarkType: 'building' },
  { qId: 'Q209555', wikiTitle: 'Kunsthalle Budapest', landmarkType: 'building' },
  { qId: 'Q606607', wikiTitle: 'Andrássy Avenue', landmarkType: 'monument' },
  { qId: 'Q252071', wikiTitle: 'Hungarian National Gallery', landmarkType: 'building' },
  { qId: 'Q681943', wikiTitle: 'Millennium Underground Railway', landmarkType: 'monument' },
  { qId: 'Q922178', wikiTitle: 'Budapest Zoo & Botanical Garden', landmarkType: 'building' },
  { qId: 'Q427016', wikiTitle: 'City Park', landmarkType: 'monument' },
  { qId: 'Q646140', wikiTitle: 'Gellért Baths', landmarkType: 'building' },
  { qId: 'Q1069906', wikiTitle: 'Memento Park', landmarkType: 'monument' },
  { qId: 'Q1298262', wikiTitle: 'Hospital in the Rock Nuclear Bunker Museum', landmarkType: 'building' },
  { qId: 'Q774636', wikiTitle: 'Hungarian National Bank', landmarkType: 'building' },
  { qId: 'Q596082', wikiTitle: 'Budapest Keleti railway station', landmarkType: 'building' },
  { qId: 'Q327775', wikiTitle: 'Budapest Nyugati railway station', landmarkType: 'building' },
  { qId: 'Q680848', wikiTitle: 'Budapest-Déli Railway Station', landmarkType: 'building' },
  { qId: 'Q933182', wikiTitle: 'Liberty Statue', landmarkType: 'statue' },
  { qId: 'Q604130', wikiTitle: 'Anonymus (statue)', landmarkType: 'statue' },
  { qId: 'Q1323775', wikiTitle: 'Statue of Imre Nagy', landmarkType: 'statue' },
  { qId: 'Q130368071', wikiTitle: 'Statue of Ronald Reagan', landmarkType: 'statue' },
]

export const isInBudapestBounds = (lat: number, lng: number): boolean =>
  lat >= 47.3 && lat <= 47.65 && lng >= 18.9 && lng <= 19.3
