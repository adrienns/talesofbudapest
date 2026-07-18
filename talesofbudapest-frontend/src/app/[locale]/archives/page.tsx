import { redirect } from 'next/navigation'
import { routing } from '@/i18n/routing'

type PageProps = {
  params: Promise<{ locale: string }>
}

const LegacyArchivesPage = async ({ params }: PageProps) => {
  const { locale } = await params
  redirect(locale === routing.defaultLocale ? '/tours' : `/${locale}/tours`)
}

export default LegacyArchivesPage
