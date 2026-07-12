import { setRequestLocale } from 'next-intl/server'
import { routing } from '@/i18n/routing'
import HomePage from './HomePage'

type PageProps = {
  params: Promise<{ locale: string }>
}

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({ locale }))

const Page = async ({ params }: PageProps) => {
  const { locale } = await params
  setRequestLocale(locale)
  return <HomePage />
}

export default Page
