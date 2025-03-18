import Image from 'next/image'

interface PartnerLogo {
  id: number
  name: string
  logo: string
  url: string
}

interface PartnerLogosProps {
  data: PartnerLogo[]
}

export function PartnerLogos({ data }: PartnerLogosProps) {
  return (
    <div className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-semibold text-gray-600 mb-8">
          Trusted by Leading Platforms
        </h2>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3">
          {data.map((partner) => (
            <div
              key={partner.id}
              className="col-span-1 flex justify-center items-center"
            >
              <a
                href={partner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative w-40 h-20"
              >
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  fill
                  className="object-contain filter grayscale hover:grayscale-0 transition-all duration-300"
                />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 