'use client'

import { useId } from 'react'
import Image from 'next/image'
import { Container } from '@/components/landing/Container'
import { motion } from 'framer-motion'

const features = [
  {
    name: "Five Essential Safety Metrics",
    description: "Understand nighttime safety, car parking security, child safety, transportation safety, and women's safety with our comprehensive scoring system.",
    icon: SafetyMetricsIcon
  },
  {
    name: "Real Crime Data Analysis",
    description: "Our metrics are calculated using official crime data from Los Angeles, ensuring you get accurate insights based on real statistics.",
    icon: CrimeDataIcon
  },
  {
    name: "Community Insights",
    description: "Access aggregated opinions from Reddit and YouTube to understand how locals and visitors perceive the safety of different neighborhoods.",
    icon: CommunityInsightsIcon
  },
  {
    name: "AI-Generated Summaries",
    description: "Our AI analyzes community opinions and creates easy-to-understand takeaways about each location's safety profile.",
    icon: AIGeneratedIcon
  },
  {
    name: "Map Integration",
    description: "View your accommodation on an interactive map with nearby safety information and comparisons to similar properties.",
    icon: MapIntegrationIcon
  },
  {
    name: "Mobile-Friendly Reports",
    description: "Access your safety reports on any device, making it easy to check safety details while on the go during your travels.",
    icon: MobileReportsIcon
  }
] as const;

function SafetyMetricsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 5C10.477 5 6 9.477 6 15C6 20.523 10.477 25 16 25C21.523 25 26 20.523 26 15C26 9.477 21.523 5 16 5ZM14 10C14 9.448 14.448 9 15 9H17C17.552 9 18 9.448 18 10V20C18 20.552 17.552 21 17 21H15C14.448 21 14 20.552 14 20V10ZM10 14C9.448 14 9 14.448 9 15V19C9 19.552 9.448 20 10 20H12C12.552 20 13 19.552 13 19V15C13 14.448 12.552 14 12 14H10ZM19 12C19 11.448 19.448 11 20 11H22C22.552 11 23 11.448 23 12V19C23 19.552 22.552 20 22 20H20C19.448 20 19 19.552 19 19V12Z"
        fill="#fc067d"
      />
    </svg>
  )
}

function CrimeDataIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5 9a4 4 0 014-4h14a4 4 0 014 4v14a4 4 0 01-4 4H9a4 4 0 01-4-4V9zm4-2a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H9z"
        fill="#fc067d"
      />
      <path
        d="M9 9h2m-2 4h6m-6 4h10m-6 4h6"
        stroke="#fc067d"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

function CommunityInsightsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 10C9 8.34315 10.3431 7 12 7C13.6569 7 15 8.34315 15 10C15 11.6569 13.6569 13 12 13C10.3431 13 9 11.6569 9 10ZM20 7C18.3431 7 17 8.34315 17 10C17 11.6569 18.3431 13 20 13C21.6569 13 23 11.6569 23 10C23 8.34315 21.6569 7 20 7ZM7 16C7 14.8954 7.89543 14 9 14H15C16.1046 14 17 14.8954 17 16V20C17 21.1046 16.1046 22 15 22H9C7.89543 22 7 21.1046 7 20V16ZM23 16C23 14.8954 22.1046 14 21 14H19C17.8954 14 17 14.8954 17 16V20C17 21.1046 17.8954 22 19 22H21C22.1046 22 23 21.1046 23 20V16Z"
        fill="#fc067d"
      />
    </svg>
  )
}

function AIGeneratedIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 8C13.7909 8 12 9.79086 12 12C12 14.2091 13.7909 16 16 16C18.2091 16 20 14.2091 20 12C20 9.79086 18.2091 8 16 8ZM8 24C8 20.6863 11.5817 18 16 18C20.4183 18 24 20.6863 24 24V25H8V24Z"
        fill="#fc067d"
      />
    </svg>
  )
}

function MapIntegrationIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 6C12.6863 6 10 8.68629 10 12C10 16.5 16 26 16 26C16 26 22 16.5 22 12C22 8.68629 19.3137 6 16 6ZM16 14C17.1046 14 18 13.1046 18 12C18 10.8954 17.1046 10 16 10C14.8954 10 14 10.8954 14 12C14 13.1046 14.8954 14 16 14Z"
        fill="#fc067d"
      />
    </svg>
  )
}

function MobileReportsIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <circle cx={16} cy={16} r={16} fill="#fc067d" fillOpacity={0.2} />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11 6C9.34315 6 8 7.34315 8 9V23C8 24.6569 9.34315 26 11 26H21C22.6569 26 24 24.6569 24 23V9C24 7.34315 22.6569 6 21 6H11ZM10 9C10 8.44772 10.4477 8 11 8H21C21.5523 8 22 8.44772 22 9V23C22 23.5523 21.5523 24 21 24H11C10.4477 24 10 23.5523 10 23V9Z"
        fill="#fc067d"
      />
      <path
        d="M16 22C16.5523 22 17 21.5523 17 21C17 20.4477 16.5523 20 16 20C15.4477 20 15 20.4477 15 21C15 21.5523 15.4477 22 16 22Z"
        fill="#fc067d"
      />
    </svg>
  )
}

export function SecondaryFeatures() {
  return (
    <section
      id="secondary-features"
      aria-label="Features for making informed travel decisions"
      className="py-20 sm:py-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl sm:text-center">
          <motion.h2 
            className="text-3xl font-medium tracking-tight text-gray-900"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Tools for Safer Travel Experiences
          </motion.h2>
          <motion.p 
            className="mt-2 text-lg text-gray-600"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Trustplace gives you the insights you need to assess accommodation safety before you book, so you can enjoy your travel with peace of mind.
          </motion.p>
        </div>
        <motion.ul
          role="list"
          className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 text-sm sm:mt-20 sm:grid-cols-2 md:gap-y-10 lg:max-w-none lg:grid-cols-3"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {features.map((feature, index) => (
            <motion.li
              key={feature.name}
              className="rounded-2xl border border-gray-200 p-8 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5 }}
            >
              <feature.icon className="h-8 w-8" />
              <h3 className="mt-6 font-semibold text-gray-900">
                {feature.name}
              </h3>
              <p className="mt-2 text-gray-700">{feature.description}</p>
            </motion.li>
          ))}
        </motion.ul>
      </Container>
    </section>
  )
}
