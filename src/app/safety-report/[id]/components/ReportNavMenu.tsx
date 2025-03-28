import React from 'react'

export type ReportSection = 'overview' | 'map' | 'safety' | 'community' | 'activities'
export type ExtendedReportSection = ReportSection | 'neighborhood'

interface ReportNavMenuProps {
  activeSection: ExtendedReportSection
  onSectionChange: (section: ExtendedReportSection) => void
}

const navItems: { id: ExtendedReportSection; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'map', label: 'Map' },
  { id: 'safety', label: 'Safety' },
  { id: 'neighborhood', label: 'Neighborhood' },
  { id: 'activities', label: 'What to Do' },
]

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export const ReportNavMenu = ({ activeSection, onSectionChange }: ReportNavMenuProps) => {
  const handleNavClick = (sectionId: ExtendedReportSection) => {
    onSectionChange(sectionId)
  }

  return (
    <nav className="-mb-px flex space-x-4 overflow-x-auto px-4 sm:px-6 lg:px-8 py-1 sm:space-x-8" aria-label="Report sections">
      {navItems.map((item) => {
        const isActive = activeSection === item.id
        return (
          <button
            key={item.id}
            onClick={() => handleNavClick(item.id)}
            className={classNames(
              isActive
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              'group inline-flex shrink-0 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500'
            )}
            aria-current={isActive ? 'page' : undefined}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNavClick(item.id); }}
            aria-label={`View ${item.label} section`}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
} 