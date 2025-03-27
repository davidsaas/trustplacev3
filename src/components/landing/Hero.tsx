'use client'

import { useId, Suspense } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import { motion } from 'framer-motion'

import { Container } from '@/components/landing/Container'
import { URLProcessor } from '@/app/safety-report/components/URLProcessor'

import logoBbc from '@/components/landing/images/logos/bbc.svg'
import logoCbs from '@/components/landing/images/logos/cbs.svg'
import logoCnn from '@/components/landing/images/logos/cnn.svg'
import logoFastCompany from '@/components/landing/images/logos/fast-company.svg'
import logoForbes from '@/components/landing/images/logos/forbes.svg'
import logoHuffpost from '@/components/landing/images/logos/huffpost.svg'
import logoTechcrunch from '@/components/landing/images/logos/techcrunch.svg'
import logoWired from '@/components/landing/images/logos/wired.svg'

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { duration: 0.6 }
  }
}

const staggerChildren = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2
    }
  }
}

function SafetyMetricBadge({ score, label, className }: { score: number; label: string; className?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: Math.random() * 0.5 }}
      className={clsx("absolute bg-white rounded-lg shadow-lg p-4 flex flex-col items-center", className)}
    >
      <div className="text-xl font-bold text-brand">{score}/100</div>
      <div className="text-sm text-gray-600">{label}</div>
    </motion.div>
  )
}

function BackgroundIllustration(props: React.ComponentPropsWithoutRef<'div'>) {
  let id = useId()

  return (
    <div {...props}>
      <svg
        viewBox="0 0 1026 1026"
        fill="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full animate-spin-slow"
      >
        <path
          d="M1025 513c0 282.77-229.23 512-512 512S1 795.77 1 513 230.23 1 513 1s512 229.23 512 512Z"
          stroke="#D4D4D4"
          strokeOpacity="0.7"
        />
        <path
          d="M513 1025C230.23 1025 1 795.77 1 513"
          stroke={`url(#${id}-gradient-1)`}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient
            id={`${id}-gradient-1`}
            x1="1"
            y1="513"
            x2="1"
            y2="1025"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fc067d" />
            <stop offset="1" stopColor="#fc067d" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <svg
        viewBox="0 0 1026 1026"
        fill="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full animate-spin-reverse-slower"
      >
        <path
          d="M913 513c0 220.914-179.086 400-400 400S113 733.914 113 513s179.086-400 400-400 400 179.086 400 400Z"
          stroke="#D4D4D4"
          strokeOpacity="0.7"
        />
        <path
          d="M913 513c0 220.914-179.086 400-400 400"
          stroke={`url(#${id}-gradient-2)`}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient
            id={`${id}-gradient-2`}
            x1="913"
            y1="513"
            x2="913"
            y2="913"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fc067d" />
            <stop offset="1" stopColor="#fc067d" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

export function Hero() {
  return (
    <div className="overflow-hidden py-20 sm:py-32 lg:pb-32 xl:pb-36">
      <Container>
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-8 lg:gap-y-20">
          <motion.div 
            className="relative z-10 mx-auto max-w-2xl lg:col-span-7 lg:max-w-none lg:pt-6 xl:col-span-6"
            initial="hidden"
            animate="visible"
            variants={staggerChildren}
          >
            <motion.h1 
              className="text-4xl font-bold tracking-tight text-gray-900"
              variants={fadeIn}
            >
              Make Safe Travel Decisions with <span className="text-brand">Trustplace</span>
            </motion.h1>
            <motion.p 
              className="mt-6 text-lg text-gray-600"
              variants={fadeIn}
            >
              Trustplace provides data-driven safety insights for travelers. Submit any Airbnb or Booking.com listing 
              in Los Angeles and get comprehensive safety reports with localized crime data and community opinions.
            </motion.p>
            <motion.div 
              className="mt-8 max-w-3xl"
              variants={fadeIn}
            >
              <Suspense fallback={<div>Loading...</div>}>
                <URLProcessor />
              </Suspense>
            </motion.div>
            
          </motion.div>
          
          <div className="relative mt-10 sm:mt-20 lg:col-span-5 lg:row-span-2 lg:mt-0 xl:col-span-6">
            <motion.div 
              className="relative aspect-[4/3] overflow-hidden rounded-xl shadow-2xl"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <Image 
                src="https://images.unsplash.com/photo-1580655653885-65763b2597d0?q=80&w=2670&auto=format&fit=crop" 
                alt="Los Angeles cityscape" 
                fill
                className="object-cover"
                priority
              />
              
              <SafetyMetricBadge 
                score={92} 
                label="Nighttime Safety" 
                className="top-4 left-4 transform rotate-[-4deg]"
              />
              
              <SafetyMetricBadge 
                score={87} 
                label="Women's Safety" 
                className="top-10 right-6 transform rotate-[3deg]"
              />
              
              <SafetyMetricBadge 
                score={79} 
                label="Car Parking" 
                className="bottom-16 left-8 transform rotate-[2deg]"
              />
              
              <SafetyMetricBadge 
                score={95} 
                label="Kids Safety" 
                className="bottom-6 right-10 transform rotate-[-3deg]"
              />
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
            </motion.div>
            
            <BackgroundIllustration className="absolute -top-16 left-1/2 h-[1026px] w-[1026px] -translate-x-1/3 stroke-gray-300/70 [mask-image:linear-gradient(to_bottom,white_20%,transparent_75%)] sm:-translate-x-1/2 lg:-top-8 xl:top-0" />
          </div>
          
          <motion.div 
            className="relative -mt-4 lg:col-span-7 lg:mt-0 xl:col-span-6"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <p className="text-center text-sm font-semibold text-gray-900 lg:text-left">
              Trusted by travelers worldwide
            </p>
            <ul
              role="list"
              className="mx-auto mt-8 flex max-w-xl flex-wrap justify-center gap-x-10 gap-y-8 lg:mx-0 lg:justify-start"
            >
              {[
                ['Forbes', logoForbes],
                ['TechCrunch', logoTechcrunch],
                ['Wired', logoWired],
                ['CNN', logoCnn, 'hidden xl:block'],
                ['BBC', logoBbc],
                ['CBS', logoCbs],
                ['Fast Company', logoFastCompany],
                ['HuffPost', logoHuffpost, 'hidden xl:block'],
              ].map(([name, logo, className], index) => (
                <motion.li 
                  key={name as string} 
                  className={clsx('flex', className)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Image src={logo} alt={name as string} className="h-8" unoptimized />
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </div>
      </Container>
    </div>
  )
}
