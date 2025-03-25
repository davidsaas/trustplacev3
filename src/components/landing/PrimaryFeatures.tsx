'use client'

import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react'
import clsx from 'clsx'
import {
  type MotionProps,
  type Variant,
  type Variants,
  AnimatePresence,
  motion,
} from 'framer-motion'
import { useDebouncedCallback } from 'use-debounce'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'

import { AppScreen } from '@/components/landing/AppScreen'
import { CircleBackground } from '@/components/landing/CircleBackground'
import { Container } from '@/components/landing/Container'
import { PhoneFrame } from '@/components/landing/PhoneFrame'

const MotionAppScreenHeader = motion(AppScreen.Header)
const MotionAppScreenBody = motion(AppScreen.Body)

interface CustomAnimationProps {
  isForwards: boolean
  changeCount: number
}

const features = [
  {
    name: "Safety Metrics Analysis",
    description:
      "Get five essential safety metrics for any accommodation: Nighttime Safety, Car Parking Safety, Kids Safety, Transportation Safety, and Women's Safety—all based on real crime data and local insights.",
    icon: SafetyMetricsIcon,
    screen: SafetyMetricsScreen,
  },
  {
    name: "Community Opinions",
    description:
      "Access aggregated community opinions from platforms like Reddit and YouTube, providing authentic local perspectives about the neighborhood and specific accommodations.",
    icon: CommunityIcon,
    screen: CommunityScreen,
  },
  {
    name: "AI-Generated Takeaways",
    description:
      "Receive smart, AI-generated summaries of community feedback and safety data, helping you quickly understand the key points without having to sift through raw data.",
    icon: AITakeawaysIcon,
    screen: AITakeawaysScreen,
  },
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

function CommunityIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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

function AITakeawaysIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
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

const headerAnimation: Variants = {
  initial: { opacity: 0, transition: { duration: 0.3 } },
  animate: { opacity: 1, transition: { duration: 0.3, delay: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.3 } },
}

const maxZIndex = 2147483647

const bodyVariantBackwards: Variant = {
  opacity: 0.4,
  scale: 0.8,
  zIndex: 0,
  filter: 'blur(4px)',
  transition: { duration: 0.4 },
}

const bodyVariantForwards: Variant = (custom: CustomAnimationProps) => ({
  y: '100%',
  zIndex: maxZIndex - custom.changeCount,
  transition: { duration: 0.4 },
})

const bodyAnimation: MotionProps = {
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  variants: {
    initial: (custom: CustomAnimationProps, ...props) =>
      custom.isForwards
        ? bodyVariantForwards(custom, ...props)
        : bodyVariantBackwards,
    animate: (custom: CustomAnimationProps) => ({
      y: '0%',
      opacity: 1,
      scale: 1,
      zIndex: maxZIndex / 2 - custom.changeCount,
      filter: 'blur(0px)',
      transition: { duration: 0.4 },
    }),
    exit: (custom: CustomAnimationProps, ...props) =>
      custom.isForwards
        ? bodyVariantBackwards
        : bodyVariantForwards(custom, ...props),
  },
}

type ScreenProps =
  | {
      animated: true
      custom: CustomAnimationProps
    }
  | { animated?: false }

function SafetyMetricsScreen(props: ScreenProps) {
  return (
    <AppScreen className="w-full">
      <MotionAppScreenHeader {...(props.animated ? headerAnimation : {})}>
        <AppScreen.Title>Safety Report</AppScreen.Title>
        <AppScreen.Subtitle>
          <span className="text-primary">Overall Score: 88/100</span>
        </AppScreen.Subtitle>
      </MotionAppScreenHeader>
      <MotionAppScreenBody
        {...(props.animated ? { ...bodyAnimation, custom: props.custom } : {})}
      >
        <div className="px-4 py-6">
          <div className="space-y-4">
            {[
              { label: 'Nighttime Safety', value: 92 },
              { label: 'Car Parking Safety', value: 78 },
              { label: 'Kids Safety', value: 95 },
              { label: 'Transportation Safety', value: 83 },
              { label: 'Women\'s Safety', value: 89 },
            ].map((metric) => (
              <div key={metric.label} className="space-y-1">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-500">{metric.label}</div>
                  <div className="text-sm font-medium">{metric.value}/100</div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-primary h-2.5 rounded-full" 
                    style={{ width: `${metric.value}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MotionAppScreenBody>
    </AppScreen>
  )
}

function CommunityScreen(props: ScreenProps) {
  const communityItems = [
    {
      source: "Reddit",
      user: "LAresident",
      comment: "This neighborhood is really quiet at night. I've lived here for 5 years and never had any issues.",
      rating: "★★★★★",
    },
    {
      source: "Reddit",
      user: "TravelExplorer",
      comment: "Great area for families. Lots of restaurants within walking distance and feels very safe.",
      rating: "★★★★☆",
    },
    {
      source: "YouTube",
      user: "CityExplorer",
      comment: "The street parking can be challenging, but there's a secure garage two blocks away.",
      rating: "★★★☆☆",
    },
    {
      source: "Local Guide",
      user: "LANative",
      comment: "Public transportation is convenient. The metro station is a 5-minute walk.",
      rating: "★★★★☆",
    },
  ];

  return (
    <AppScreen className="w-full">
      <MotionAppScreenHeader {...(props.animated ? headerAnimation : {})}>
        <AppScreen.Title>Community Insights</AppScreen.Title>
        <AppScreen.Subtitle>Local perspectives</AppScreen.Subtitle>
      </MotionAppScreenHeader>
      <MotionAppScreenBody
        {...(props.animated ? { ...bodyAnimation, custom: props.custom } : {})}
      >
        <div className="divide-y divide-gray-100">
          {communityItems.map((item) => (
            <div key={item.user} className="flex gap-4 p-4">
              <div className="flex-none">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
                  {item.source.charAt(0)}
                </span>
              </div>
              <div className="flex-auto">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-900">
                    {item.user}
                    <span className="text-gray-500 text-xs ml-2">via {item.source}</span>
                  </div>
                  <div className="text-xs text-primary">{item.rating}</div>
                </div>
                <div className="mt-1 text-sm text-gray-700">{item.comment}</div>
              </div>
            </div>
          ))}
        </div>
      </MotionAppScreenBody>
    </AppScreen>
  );
}

function AITakeawaysScreen(props: ScreenProps) {
  return (
    <AppScreen className="w-full">
      <MotionAppScreenHeader {...(props.animated ? headerAnimation : {})}>
        <AppScreen.Title>AI Summary</AppScreen.Title>
        <AppScreen.Subtitle>Key insights</AppScreen.Subtitle>
      </MotionAppScreenHeader>
      <MotionAppScreenBody
        {...(props.animated ? { ...bodyAnimation, custom: props.custom } : {})}
      >
        <div className="px-4 py-6">
          <div className="space-y-6">
            <div className="rounded-lg bg-yellow-50 border border-yellow-100 p-4">
              <div className="font-medium text-sm text-gray-900 mb-2">Safety Overview</div>
              <p className="text-sm text-gray-700">
                This accommodation has excellent safety ratings, particularly for families and nighttime safety. The area is well-lit and has regular police patrols.
              </p>
            </div>
            
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <div className="font-medium text-sm text-gray-900 mb-2">Local Opinion</div>
              <p className="text-sm text-gray-700">
                Residents consistently mention the neighborhood's friendly atmosphere and convenient access to amenities. Several comments note the strong community feel.
              </p>
            </div>
            
            <div className="rounded-lg bg-green-50 border border-green-100 p-4">
              <div className="font-medium text-sm text-gray-900 mb-2">Transportation</div>
              <p className="text-sm text-gray-700">
                Public transportation is highly rated with a metro station nearby. Ride-sharing services are readily available with average wait times under 5 minutes.
              </p>
            </div>
            
            <div className="mt-6 rounded-lg bg-primary px-3 py-2 text-center text-sm font-semibold text-white">
              View Full Report
            </div>
          </div>
        </div>
      </MotionAppScreenBody>
    </AppScreen>
  )
}

function usePrevious<T>(value: T) {
  let ref = useRef<T>()

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}

function FeaturesDesktop() {
  let [changeCount, setChangeCount] = useState(0)
  let [selectedIndex, setSelectedIndex] = useState(0)
  let prevIndex = usePrevious(selectedIndex)
  let isForwards = prevIndex === undefined ? true : selectedIndex > prevIndex

  let onChange = useDebouncedCallback(
    (selectedIndex) => {
      setSelectedIndex(selectedIndex)
      setChangeCount((changeCount) => changeCount + 1)
    },
    100,
    { leading: true },
  )

  return (
    <TabGroup
      className="grid grid-cols-12 items-center gap-8 lg:gap-16 xl:gap-24"
      selectedIndex={selectedIndex}
      onChange={onChange}
      vertical
    >
      <TabList className="relative z-10 order-last col-span-6 space-y-6">
        {features.map((feature, featureIndex) => (
          <div
            key={feature.name}
            className="relative rounded-2xl transition-colors hover:bg-gray-800/30"
          >
            {featureIndex === selectedIndex && (
              <motion.div
                layoutId="activeBackground"
                className="absolute inset-0 bg-primary/20"
                initial={{ borderRadius: 16 }}
              />
            )}
            <div className="relative z-10 p-8">
              <feature.icon className="h-8 w-8" />
              <h3 className="mt-6 text-lg font-semibold text-white">
                <Tab className="text-left data-selected:not-data-focus:outline-hidden">
                  <span className="absolute inset-0 rounded-2xl" />
                  {feature.name}
                </Tab>
              </h3>
              <p className="mt-2 text-sm text-gray-400">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </TabList>
      <div className="relative col-span-6">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <CircleBackground color="#fc067d" className="animate-spin-slower" />
        </div>
        <PhoneFrame className="z-10 mx-auto w-full max-w-[366px]">
          <TabPanels as={Fragment}>
            <AnimatePresence
              initial={false}
              custom={{ isForwards, changeCount }}
            >
              {features.map((feature, featureIndex) =>
                selectedIndex === featureIndex ? (
                  <TabPanel
                    static
                    key={feature.name + changeCount}
                    className="col-start-1 row-start-1 flex focus:outline-offset-[32px] data-selected:not-data-focus:outline-hidden"
                  >
                    <feature.screen
                      animated
                      custom={{ isForwards, changeCount }}
                    />
                  </TabPanel>
                ) : null,
              )}
            </AnimatePresence>
          </TabPanels>
        </PhoneFrame>
      </div>
    </TabGroup>
  )
}

function FeaturesMobile() {
  let [activeIndex, setActiveIndex] = useState(0)
  let slideContainerRef = useRef<React.ElementRef<'div'>>(null)
  let slideRefs = useRef<Array<React.ElementRef<'div'>>>([])

  useEffect(() => {
    let observer = new window.IntersectionObserver(
      (entries) => {
        for (let entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLDivElement) {
            setActiveIndex(slideRefs.current.indexOf(entry.target))
            break
          }
        }
      },
      {
        root: slideContainerRef.current,
        threshold: 0.6,
      },
    )

    for (let slide of slideRefs.current) {
      if (slide) {
        observer.observe(slide)
      }
    }

    return () => {
      observer.disconnect()
    }
  }, [slideContainerRef, slideRefs])

  return (
    <>
      <div
        ref={slideContainerRef}
        className="-mb-4 flex snap-x snap-mandatory -space-x-4 overflow-x-auto overscroll-x-contain scroll-smooth pb-4 [scrollbar-width:none] sm:-space-x-6 [&::-webkit-scrollbar]:hidden"
      >
        {features.map((feature, featureIndex) => (
          <div
            key={featureIndex}
            ref={(element: HTMLDivElement | null) => {
              if (element) {
                slideRefs.current[featureIndex] = element
              }
            }}
            className="w-full flex-none snap-center px-4 sm:px-6"
          >
            <div className="relative transform overflow-hidden rounded-2xl bg-gray-800 px-5 py-6">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <CircleBackground
                  color="#fc067d"
                  className={featureIndex % 2 === 1 ? 'rotate-180' : undefined}
                />
              </div>
              <PhoneFrame className="relative mx-auto w-full max-w-[366px]">
                <feature.screen />
              </PhoneFrame>
              <div className="absolute inset-x-0 bottom-0 bg-gray-800/95 p-6 backdrop-blur-sm sm:p-10">
                <feature.icon className="h-8 w-8" />
                <h3 className="mt-6 text-sm font-semibold text-white sm:text-lg">
                  {feature.name}
                </h3>
                <p className="mt-2 text-sm text-gray-400">
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 flex justify-center gap-3">
        {features.map((_, featureIndex) => (
          <button
            type="button"
            key={featureIndex}
            className={clsx(
              'relative h-0.5 w-4 rounded-full',
              featureIndex === activeIndex ? 'bg-primary' : 'bg-gray-500',
            )}
            aria-label={`Go to slide ${featureIndex + 1}`}
            onClick={() => {
              slideRefs.current[featureIndex].scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
              })
            }}
          >
            <span className="absolute -inset-x-1.5 -inset-y-3" />
          </button>
        ))}
      </div>
    </>
  )
}

export function PrimaryFeatures() {
  return (
    <section
      id="features"
      aria-label="Features for safety insights"
      className="bg-gray-900 py-20 sm:py-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-3xl">
          <motion.h2 
            className="text-3xl font-medium tracking-tight text-white"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            Comprehensive Safety Insights for Travelers
          </motion.h2>
          <motion.p 
            className="mt-2 text-lg text-gray-400"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Trustplace analyzes real crime data, community opinions, and local insights to provide you with a complete safety picture of any accommodation.
          </motion.p>
        </div>
      </Container>
      <motion.div 
        className="mt-16 md:hidden"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <FeaturesMobile />
      </motion.div>
      <Container className="hidden md:mt-20 md:block">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <FeaturesDesktop />
        </motion.div>
      </Container>
    </section>
  )
}
