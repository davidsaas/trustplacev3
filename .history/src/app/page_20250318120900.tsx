import { getLandingPageData } from '@/lib/strapi/landing-page'
import { HeroSection } from '@/components/sections/hero-section'
import { PartnerLogos } from '@/components/sections/partner-logos'
import { Testimonials } from '@/components/sections/testimonials'

export default async function Home() {
  const { heroSection, partnerLogos, testimonials, features } = await getLandingPageData()

  return (
    <main>
      <HeroSection data={heroSection} />
      <PartnerLogos data={partnerLogos} />
      <Testimonials data={testimonials} />
    </main>
  )
}
