import { memo } from 'react'
import type { PropertyMetricsProps } from '@/types/safety-report'
import { formatPrice } from '../utils'
import { DollarSign } from 'lucide-react'

export const PropertyMetrics = memo(({ 
  price_per_night,
  source
}: PropertyMetricsProps) => {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
      {price_per_night && (
        <div className="flex items-center gap-1.5">
          <span className="flex items-center justify-center p-1 bg-emerald-50 rounded-full">
            <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          </span>
          <span className="font-medium text-gray-900">{formatPrice(price_per_night)}</span>
          <span className="text-gray-500">/ night</span>
        </div>
      )}
    </div>
  )
}) 

PropertyMetrics.displayName = 'PropertyMetrics' 