import { Suspense } from 'react'
import { URLProcessor } from '@/components/safety-report/URLProcessor'

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-5xl font-bold mb-6">
            Check Your Accommodation&apos;s Safety Score
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Get instant safety insights for any Airbnb or Booking.com listing in Los Angeles
          </p>
          
          {/* URL Processor */}
          <div className="max-w-3xl mx-auto">
            <Suspense fallback={<div>Loading...</div>}>
              <URLProcessor />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Make informed decisions with our safety metrics
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Neighborhood Safety",
                description: "Get detailed insights about the area's safety based on real crime data"
              },
              {
                title: "Community Reviews",
                description: "Read what locals and travelers say about the location"
              },
              {
                title: "Smart Recommendations",
                description: "Discover safer alternatives in similar price ranges"
              }
            ].map((feature) => (
              <div key={feature.title} className="p-6 bg-white rounded-lg shadow-sm">
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
