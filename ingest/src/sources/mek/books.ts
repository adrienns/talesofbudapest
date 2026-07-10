export type MekLicense = {
  identifier: 'Public-Domain' | 'CC-BY-SA-4.0'
  attribution: string
  evidenceUrl: string
}

export type MekBook = {
  mekId: string
  title: string
  author: string
  sourceUrl: string
  topic: string
  license: MekLicense
  pdfs: Array<{ label: string; url: string }>
}

export const MEK_BUDAPEST_BOOKS: MekBook[] = [
  {
    mekId: 'MEK-15124',
    title: 'Budapest képes lexicona: Kézikönyv Budapest összes tudnivalóiról',
    author: 'Hell Lajos',
    sourceUrl: 'https://mek.oszk.hu/15100/15124/',
    topic: 'Budapest local history, places, institutions, and historical city reference',
    license: { identifier: 'Public-Domain', attribution: 'Hell Lajos, Budapest képes lexicona, MEK-15124 / OSZK', evidenceUrl: 'https://mek.oszk.hu/15100/15124/cedula.html' },
    pdfs: [
      { label: 'volume-1', url: 'https://mek.oszk.hu/15100/15124/pdf/15124_1.pdf' },
      { label: 'volume-2', url: 'https://mek.oszk.hu/15100/15124/pdf/15124_2.pdf' },
    ],
  },
  {
    mekId: 'MEK-17520',
    title: 'Budapest',
    author: 'Lux Terka',
    sourceUrl: 'https://mek.oszk.hu/17500/17520/17520.htm',
    topic: 'Literary portrait of early twentieth-century Budapest and city life',
    license: { identifier: 'CC-BY-SA-4.0', attribution: 'Lux Terka, Budapest, MEK-17520 / OSZK, CC BY-SA 4.0', evidenceUrl: 'https://mek.oszk.hu/17500/17520/17520.htm' },
    pdfs: [{ label: 'scan', url: 'https://mek.oszk.hu/17500/17520/pdf/17520.pdf' }],
  },
  {
    mekId: 'MEK-04093',
    title: 'Magyar zsidó lexikon (1929) — A címszavak',
    author: 'Szerkesztette Újvári Péter',
    sourceUrl: 'https://mek.oszk.hu/04000/04093/',
    topic: 'Hungarian Jewish history, institutions, people, Budapest, and Jewish life up to 1929',
    license: { identifier: 'Public-Domain', attribution: 'Újvári Péter (ed.), Magyar zsidó lexikon, 1929 / MEK-04093 / OSZK', evidenceUrl: 'https://mek.oszk.hu/04000/04093/cedula.html' },
    pdfs: [{ label: 'letter-a', url: 'https://mek.oszk.hu/04000/04093/pdf/a.pdf' }],
  },
]

export const findMekBook = (mekId: string): MekBook | undefined => MEK_BUDAPEST_BOOKS.find((book) => book.mekId === mekId)
