'use client'

import { useState, useEffect } from 'react'
import { SearchForm } from '@/components/forms/search-form'

interface HeroSection {
  title: string
  description: string
  keywords: string[]
  backgroundImage: string
}

interface HeroSectionProps {
  data: HeroSection
}

export function HeroSection({ data }: HeroSectionProps) {
  const [currentKeywordIndex, setCurrentKeywordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentKeywordIndex((prev) => (prev + 1) % data.keywords.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [data.keywords.length])

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[80vh] p-8">
      {/* Background Image */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `url(${data.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto text-center text-white">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          {data.title.replace('{keyword}', data.keywords[currentKeywordIndex])}
        </h1>
        <p className="text-xl md:text-2xl mb-12 text-gray-200">
          {data.description}
        </p>
        <SearchForm />
      </div>
    </div>
  )
} 