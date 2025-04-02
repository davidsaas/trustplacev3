import React from 'react'

export type ReportSection = 'overview' | 'map' | 'safety' | 'community' | 'activities' | 'comments'
export type ExtendedReportSection = ReportSection | 'neighborhood' | 'alternatives'

interface ReportNavMenuProps {
  activeSection: ExtendedReportSection
  onSectionChange: (section: ExtendedReportSection) => void
  commentsCount?: number
}

const navItems: { id: ExtendedReportSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'safety', label: 'Safety' },
  { id: 'neighborhood', label: 'Neighborhood' },
  { id: 'comments', label: 'Comments' },
  { id: 'activities', label: 'What to Do' },
]

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export const ReportNavMenu = ({ activeSection, onSectionChange, commentsCount = 0 }: ReportNavMenuProps) => {
  const handleNavClick = (sectionId: ExtendedReportSection) => {
    onSectionChange(sectionId)
  }

  return (
    <nav className="-mb-px flex space-x-4 overflow-x-auto px-4 sm:px-6 lg:px-8 py-1 sm:space-x-8" aria-label="Report sections">
      {navItems.map((item) => {
        const isActive = activeSection === item.id
        const isComments = item.id === 'comments';
        const displayCount = isComments && commentsCount > 0;

        return (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={classNames(
              isActive
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex items-center shrink-0 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500'
            )}
            aria-current={isActive ? 'page' : undefined}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavClick(item.id); }}
            aria-label={`View ${item.label} section ${displayCount ? `(${commentsCount} comments)` : ''}`}
          >
            {item.label}
            {displayCount && (
                <span className={`ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${isActive ? 'bg-blue-100 text-blue-600 ring-blue-300' : 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                    {commentsCount}
                </span>
            )}
          </button>
        )
      })}
    </nav>
  )
} 