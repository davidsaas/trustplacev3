import { fetchAPI } from './client'
import type {
  StrapiResponse,
  StrapiSingleResponse,
  HeroSection,
  PartnerLogo,
  Testimonial,
  Feature,
} from '@/types/strapi'

export async function getHeroSection() {
  const response = await fetchAPI<StrapiSingleResponse<HeroSection>>({
    path: '/hero-section',
    urlParamsObject: {
      populate: '*',
    },
  })
  return response.data.attributes
}

export async function getPartnerLogos() {
  const response = await fetchAPI<StrapiResponse<PartnerLogo>>({
    path: '/partner-logos',
    urlParamsObject: {
      populate: '*',
    },
  })
  return response.data.map(item => item.attributes)
}

export async function getTestimonials() {
  const response = await fetchAPI<StrapiResponse<Testimonial>>({
    path: '/testimonials',
    urlParamsObject: {
      populate: '*',
    },
  })
  return response.data.map(item => item.attributes)
}

export async function getFeatures() {
  const response = await fetchAPI<StrapiResponse<Feature>>({
    path: '/features',
    urlParamsObject: {
      populate: '*',
    },
  })
  return response.data.map(item => item.attributes)
}

export async function getLandingPageData() {
  const [heroSection, partnerLogos, testimonials, features] = await Promise.all([
    getHeroSection(),
    getPartnerLogos(),
    getTestimonials(),
    getFeatures(),
  ])

  return {
    heroSection,
    partnerLogos,
    testimonials,
    features,
  }
} 