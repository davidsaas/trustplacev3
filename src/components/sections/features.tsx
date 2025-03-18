import { ChartBarIcon, UsersIcon, ShieldCheckIcon, BeakerIcon } from '@heroicons/react/24/outline'

interface Feature {
  id: number
  title: string
  description: string
  icon: string
}

interface FeaturesProps {
  data: Feature[]
}

const ICON_MAP = {
  chart: ChartBarIcon,
  users: UsersIcon,
  shield: ShieldCheckIcon,
  brain: BeakerIcon,
}

export function Features({ data }: FeaturesProps) {
  return (
    <section className="py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-4xl font-bold text-center mb-16">Why Choose Trustplace</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {data.map((feature) => {
            const Icon = ICON_MAP[feature.icon as keyof typeof ICON_MAP]
            return (
              <div
                key={feature.id}
                className="flex flex-col items-center text-center p-6 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 mb-4 text-primary-600">
                  <Icon className="w-full h-full" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
} 