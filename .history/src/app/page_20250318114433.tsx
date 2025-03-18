import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SearchForm } from '@/components/forms/search-form'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-white via-white dark:from-black dark:via-black lg:static lg:h-auto lg:w-auto lg:bg-none">
          <div className="flex items-center justify-center gap-2">
            <Link href="/sign-in">
              <Button variant="outline">Sign In</Button>
            </Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center gap-8 py-16">
        <h1 className="text-6xl font-bold text-center">
          Your Safety Guide for
          <span className="text-primary"> Travel Accommodations</span>
        </h1>
        <p className="text-xl text-center text-muted-foreground max-w-2xl">
          Get comprehensive safety reports for Airbnb and Booking.com listings in Los Angeles.
          Make informed decisions about your stay.
        </p>
        <SearchForm />
      </div>

      <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left">
        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h2 className="mb-3 text-2xl font-semibold">
            Safety Metrics{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Get detailed safety scores based on real crime data and community insights.
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h2 className="mb-3 text-2xl font-semibold">
            Community Reviews{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Real experiences from Reddit and YouTube, analyzed for your safety.
          </p>
        </div>

        <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
          <h2 className="mb-3 text-2xl font-semibold">
            Location Analysis{' '}
            <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
              -&gt;
            </span>
          </h2>
          <p className="m-0 max-w-[30ch] text-sm opacity-50">
            Interactive maps showing safety scores and nearby alternatives.
          </p>
        </div>
      </div>
    </main>
  )
}
