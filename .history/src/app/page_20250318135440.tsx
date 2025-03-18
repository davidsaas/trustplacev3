import { HERO_SECTION, PARTNER_LOGOS, TESTIMONIALS, FEATURES } from '@/lib/constants/landing-page'
import { HeroSection } from '@/components/sections/hero-section'
import { PartnerLogos } from '@/components/sections/partner-logos'
import { Testimonials } from '@/components/sections/testimonials'
import { Features } from '@/components/sections/features'

export default function Home() {
  return (
    <main className="min-h-screen">
      <HeroSection data={HERO_SECTION} />
      <PartnerLogos data={PARTNER_LOGOS} />
      <Testimonials data={TESTIMONIALS} />
      <Features data={FEATURES} />
    </main>
  )
}
