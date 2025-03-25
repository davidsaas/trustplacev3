'use client'

import { CircleBackground } from '@/components/landing/CircleBackground'
import { Container } from '@/components/landing/Container'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { motion } from 'framer-motion'

export function CallToAction() {
  return (
    <section
      id="get-safety-report"
      className="relative overflow-hidden bg-gray-900 py-20 sm:py-28"
    >
      <div className="absolute top-1/2 left-20 -translate-y-1/2 sm:left-1/2 sm:-translate-x-1/2">
        <CircleBackground color="#fc067d" className="animate-spin-slower" />
      </div>
      <Container className="relative">
        <motion.div 
          className="mx-auto max-w-md sm:text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
            Check your accommodation's <span className="text-brand">safety score</span> today
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            Simply paste your Airbnb or Booking.com URL and get instant access to comprehensive safety metrics, 
            community insights, and AI-generated safety summaries for your next Los Angeles stay.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link href="/auth/sign-up">
              <Button className="bg-primary hover:bg-primary/90 text-white py-6 px-8 text-lg">
                Try it for free
              </Button>
            </Link>
            <a href="#features">
              <Button className="border-white bg-transparent text-white hover:bg-white/10 py-6 px-8 text-lg">
                Learn more
              </Button>
            </a>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
