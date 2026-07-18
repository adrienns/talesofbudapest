import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import ToursPage from '../archives/ArchivesPage'

type PageProps = {
  params: Promise<{ locale: string }>
}

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }))

const Page = async ({ params }: PageProps) => {
  const { locale } = await params
  setRequestLocale(locale)
  return <ToursPage />
}

export default Page
