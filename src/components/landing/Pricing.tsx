'use client'

import { useState } from 'react'
import { Radio, RadioGroup } from '@headlessui/react'
import clsx from 'clsx'

import { Button } from '@/components/landing/Button'
import { Container } from '@/components/landing/Container'

// Local Logo component
function Logomark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20 40C8.954 40 0 31.046 0 20S8.954 0 20 0s20 8.954 20 20-8.954 20-20 20ZM4 20c0 8.837 7.163 16 16 16s16-7.163 16-16S28.837 4 20 4 4 11.163 4 20Z"
        fill="#A3A3A3"
      />
      <path
        d="M20 25.6c-3.092 0-5.6-2.508-5.6-5.6 0-3.092 2.508-5.6 5.6-5.6 3.092 0 5.6 2.508 5.6 5.6 0 3.092-2.508 5.6-5.6 5.6Z"
        fill="#171717"
      />
    </svg>
  )
}

interface Plan {
  name: string
  featured?: boolean
  price: { Monthly: string; Annually: string }
  description: string
  button: {
    label: string
    href: string
  }
  features: string[]
}

function CheckIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M9.307 12.248a.75.75 0 1 0-1.114 1.004l1.114-1.004ZM11 15.25l-.557.502a.75.75 0 0 0 1.15-.043L11 15.25Zm4.844-5.041a.75.75 0 0 0-1.188-.918l1.188.918Zm-7.651 3.043 2.25 2.5 1.114-1.004-2.25-2.5-1.114 1.004Zm3.4 2.457 4.25-5.5-1.187-.918-4.25 5.5 1.188.918Z"
        fill="currentColor"
      />
      <circle
        cx="12"
        cy="12"
        r="8.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const plans = [
  {
    name: "Starter",
    featured: false,
    price: { Monthly: "$0", Annually: "$0" },
    description: "You're new to investing but want to do it right. Get started for free.",
    button: {
      label: "Get started for free",
      href: "/register",
    },
    features: [
      "Commission-free trading",
      "Multi-layered encryption",
      "One tip every 3 days",
      "Invest up to $1,500 each month",
    ],
  },
  {
    name: "Investor",
    featured: true,
    price: { Monthly: "$7", Annually: "$70" },
    description: "You've been investing for a while. Invest more and grow your wealth faster.",
    button: {
      label: "Subscribe",
      href: "/register",
    },
    features: [
      "Commission-free trading",
      "Multi-layered encryption",
      "One tip every day",
      "Invest up to $15,000 each month",
      "Basic transaction anonymization",
    ],
  },
  {
    name: "VIP",
    featured: false,
    price: { Monthly: "$199", Annually: "$1,990" },
    description: "You've got a huge amount of assets but it's not enough. To the moon.",
    button: {
      label: "Subscribe",
      href: "/register",
    },
    features: [
      "Commission-free trading",
      "Multi-layered encryption",
      "Real-time tip notifications",
      "No investment limits",
      "Advanced transaction anonymization",
      "Automated tax loss harvesting",
    ],
  },
] as const satisfies readonly Plan[];

export function Pricing() {
  let [activePeriod, setActivePeriod] = useState<'Monthly' | 'Annually'>(
    'Monthly',
  )

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-title"
      className="border-t border-gray-200 bg-gray-100 py-20 sm:py-32"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="pricing-title"
            className="text-3xl font-medium tracking-tight text-gray-900"
          >
            Flat pricing, no management fees.
          </h2>
          <p className="mt-2 text-lg text-gray-600">
            Whether you're one person trying to get ahead or a big firm trying
            to take over the world, we've got a plan for you.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="relative">
            <RadioGroup
              value={activePeriod}
              onChange={setActivePeriod}
              className="grid grid-cols-2"
            >
              {['Monthly', 'Annually'].map((period) => (
                <Radio
                  key={period}
                  value={period}
                  className={clsx(
                    'cursor-pointer border border-gray-300 px-[calc(--spacing(3)-1px)] py-[calc(--spacing(2)-1px)] text-sm text-gray-700 transition-colors hover:border-gray-400 focus:outline-2 focus:outline-offset-2',
                    period === 'Monthly'
                      ? 'rounded-l-lg'
                      : '-ml-px rounded-r-lg',
                  )}
                >
                  {period}
                </Radio>
              ))}
            </RadioGroup>
            <div
              aria-hidden="true"
              className={clsx(
                'pointer-events-none absolute inset-0 z-10 grid grid-cols-2 overflow-hidden rounded-lg bg-cyan-500 transition-all duration-300',
                activePeriod === 'Monthly'
                  ? '[clip-path:inset(0_50%_0_0)]'
                  : '[clip-path:inset(0_0_0_calc(50%-1px))]',
              )}
            >
              {['Monthly', 'Annually'].map((period) => (
                <div
                  key={period}
                  className={clsx(
                    'py-2 text-center text-sm font-semibold text-white',
                    period === 'Annually' && '-ml-px',
                  )}
                >
                  {period}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 items-start gap-x-8 gap-y-10 sm:mt-20 lg:max-w-none lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={clsx(
                'relative rounded-2xl bg-white p-8',
                plan.featured && 'ring-2 ring-cyan-500'
              )}
            >
              <div className="flex items-center justify-between gap-4">
                <h3
                  id={`${plan.name}-price`}
                  className="text-lg font-semibold leading-8 text-gray-900"
                >
                  {plan.name}
                </h3>
                <Logomark className="h-8 w-8 flex-none" />
              </div>
              <p className="mt-6 flex items-baseline gap-x-1">
                <span className="text-4xl font-bold text-gray-900">
                  {plan.price.Monthly}
                </span>
                <span className="text-sm font-semibold leading-6 text-gray-600">
                  /month
                </span>
              </p>
              <p className="mt-3 text-sm leading-6 text-gray-700">
                {plan.price.Annually} per year
              </p>
              <p className="mt-4 text-sm leading-6 text-gray-600">
                {plan.description}
              </p>
              <div className="mt-8">
                <Button
                  href={plan.button.href}
                  variant="solid"
                  color={plan.featured ? 'cyan' : 'gray'}
                  className="w-full"
                  aria-label={`Get started with the ${plan.name} plan for ${plan.price.Monthly}/month`}
                >
                  {plan.button.label}
                </Button>
              </div>
              <ul
                role="list"
                className="mt-8 space-y-3 text-sm leading-6 text-gray-600"
              >
                {plan.features.map((feature) => (
                  <li key={feature} className="flex">
                    <CheckIcon className="h-6 w-5 flex-none text-cyan-500" />
                    <span className="ml-3">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
