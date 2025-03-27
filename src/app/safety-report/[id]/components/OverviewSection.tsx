import { Info, CheckCircle, AlertTriangle } from 'lucide-react'

type OverviewSectionProps = {
  takeaways: string[] | null
}

// Helper to determine icon based on takeaway text (copied from PropertyHeader)
const getTakeawayIcon = (text: string) => {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('safe') || lowerText.includes('good') || lowerText.includes('quiet') || lowerText.includes('well-lit') || lowerText.includes('positive')) {
        return <CheckCircle className="h-4 w-4 text-emerald-600 flex-shrink-0" />;
    }
    if (lowerText.includes('watch out') || lowerText.includes('risk') || lowerText.includes('avoid') || lowerText.includes('noise') || lowerText.includes('concern') || lowerText.includes('harassment')) {
        return <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />;
    }
    return <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />; // Default icon
};

export const OverviewSection = ({ takeaways }: OverviewSectionProps) => {
  const hasTakeaways = takeaways && takeaways.length > 0;

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-4 py-5 sm:px-6 rounded-t-xl shadow-sm">
        <div className="-ml-4 -mt-4 flex flex-wrap items-center justify-between sm:flex-nowrap">
          <div className="ml-4 mt-4">
            <h3 className="text-base font-semibold text-gray-900">Overview</h3>
            <p className="mt-1 text-sm text-gray-500">
              Key safety takeaways for this property.
            </p>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 shadow-sm rounded-b-xl">
        {hasTakeaways ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {takeaways.map((takeaway, index) => (
              <div
                key={index}
                className="relative overflow-hidden rounded-xl border border-gray-100"
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)'
                }}
              >
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />

                <div className="relative p-4 flex items-start gap-3">
                  {getTakeawayIcon(takeaway)}
                  <p className="text-sm text-gray-800 leading-relaxed">{takeaway}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-lg bg-gray-50 flex items-center justify-center">
            <p className="text-gray-500">No specific takeaways available for this property.</p>
          </div>
        )}
      </div>
    </div>
  );
}; 