import { Header } from '@/components/landing/Header'
import { Hero } from '@/components/landing/Hero'
import { PrimaryFeatures } from '@/components/landing/PrimaryFeatures'
import { SecondaryFeatures } from '@/components/landing/SecondaryFeatures'
import { Reviews } from '@/components/landing/Reviews'
import { Faqs } from '@/components/landing/Faqs'
import { Footer } from '@/components/landing/Footer'

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <PrimaryFeatures />
        <SecondaryFeatures />
        <Reviews />
        <Faqs />
      </main>
      <Footer />
    </>
  )
}
