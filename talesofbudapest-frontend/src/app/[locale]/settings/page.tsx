import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import SettingsPage from './SettingsPage'

type PageProps = {
  params: Promise<{ locale: string }>
}

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }))

const Page = async ({ params }: PageProps) => {
  const { locale } = await params
  setRequestLocale(locale)
  return <SettingsPage />
}

export default Page
