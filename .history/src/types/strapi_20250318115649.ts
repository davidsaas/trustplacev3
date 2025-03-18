export interface StrapiResponse<T> {
  data: {
    id: number
    attributes: T
  }[]
  meta: {
    pagination: {
      page: number
      pageSize: number
      pageCount: number
      total: number
    }
  }
}

export interface StrapiSingleResponse<T> {
  data: {
    id: number
    attributes: T
  }
  meta: {}
}

export interface StrapiImage {
  data: {
    id: number
    attributes: {
      url: string
      alternativeText: string
      caption: string
      width: number
      height: number
    }
  }
}

export interface HeroSection {
  title: string
  subtitle: string
  keywords: string[]
  backgroundImage: StrapiImage
}

export interface PartnerLogo {
  name: string
  url: string
  logo: StrapiImage
}

export interface Testimonial {
  name: string
  role: string
  content: string
  avatar: StrapiImage
}

export interface Feature {
  title: string
  description: string
  icon: string
} 