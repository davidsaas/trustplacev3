'use client'

import clsx from 'clsx'

interface Review {
  title: string
  body: string
  author: string
  rating: number
}

const reviews: Review[] = [
  {
    title: "Mind-blowing",
    body: "I started using this app when I was just a broke college student. Now I'm a broke college graduate, but at least I have a Lambo to show for it.",
    author: "YOLO2TheMoon",
    rating: 5,
  },
  {
    title: "You need this app.",
    body: "I didn't understand the stock market at all before Pocket. I still don't, but at least I'm rich now.",
    author: "CluelessButRich",
    rating: 5,
  },
  {
    title: "Better than expected",
    body: "I was really skeptical at first, but after just a few trades following insider tips, I'm totally convinced. It's like having a time machine for the stock market.",
    author: "StonksOnly",
    rating: 5,
  },
  {
    title: "No more day job",
    body: "I used to work at a big tech company. Now I focus full-time on trading. The tips have been indispensable, and the automated trading features are a game changer.",
    author: "RetiredAt35",
    rating: 5,
  },
  {
    title: "Incredible interface",
    body: "The attention to detail in the app's interface really shows. I especially love how easy it is to see upcoming insider trading opportunities.",
    author: "UXLover",
    rating: 5,
  },
  {
    title: "Exactly what I needed",
    body: "I've always wanted to get into insider trading but didn't know where to start. This app makes it so easy, my grandmother could do it.",
    author: "NewToThis",
    rating: 5,
  },
]

function StarIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function ReviewCard({ review, className }: { review: Review; className?: string }) {
  return (
    <div className={clsx('rounded-3xl bg-white p-6 shadow-md shadow-gray-900/5', className)}>
      <div className="text-gray-900">
        <p className="mt-4 text-lg font-semibold leading-6">{review.title}</p>
        <p className="mt-3 text-base leading-7">{review.body}</p>
      </div>
      <div className="mt-3 flex items-center gap-x-4 border-t border-gray-900/10 pt-6">
        <div>
          <div className="font-semibold">{review.author}</div>
          <div className="mt-1 flex">
            {[...Array(review.rating)].map((_, i) => (
              <StarIcon key={i} className="h-5 w-5 fill-cyan-500" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Reviews() {
  return (
    <div className="mx-auto max-w-7xl px-6 lg:px-8">
      <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-16 lg:mx-0 lg:mt-20 lg:max-w-none lg:grid-cols-3">
        {reviews.map((review) => (
          <ReviewCard key={review.title} review={review} />
        ))}
      </div>
    </div>
  )
}
