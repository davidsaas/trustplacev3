import Image from 'next/image'
import type { Testimonial } from '@/types/strapi'

interface TestimonialsProps {
  data: Testimonial[]
}

export function Testimonials({ data }: TestimonialsProps) {
  return (
    <div className="py-24 bg-white sm:py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-lg font-semibold leading-8 tracking-tight text-primary">Testimonials</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            What Our Users Say
          </p>
        </div>
        <div className="mx-auto mt-16 flow-root max-w-2xl sm:mt-20 lg:mx-0 lg:max-w-none">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((testimonial) => (
              <div key={testimonial.name} className="flex flex-col gap-6 rounded-2xl bg-gray-50 px-8 py-10">
                <div className="flex items-center gap-x-4">
                  <div className="relative h-12 w-12 rounded-full">
                    <Image
                      src={testimonial.avatar.data.attributes.url}
                      alt={testimonial.avatar.data.attributes.alternativeText || testimonial.name}
                      fill
                      className="rounded-full object-cover"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold leading-7 tracking-tight text-gray-900">
                      {testimonial.name}
                    </h3>
                    <p className="text-sm font-semibold leading-6 text-primary">{testimonial.role}</p>
                  </div>
                </div>
                <p className="text-base leading-7 text-gray-600">{testimonial.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 