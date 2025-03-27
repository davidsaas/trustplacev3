import { useState } from 'react'
import { MapPin, ShieldCheck, MessageSquare, Eye } from 'lucide-react'

export type ReportSection = 'overview' | 'map' | 'safety' | 'community'

type ReportNavMenuProps = {
  activeSection: ReportSection
  onSectionChange: (section: ReportSection) => void
}

const navItems = [
  { id: 'overview', label: 'Overview', icon: Eye },
  { id: 'map', label: 'Map View', icon: MapPin },
  { id: 'safety', label: 'Safety Analysis', icon: ShieldCheck },
  { id: 'community', label: 'Community Feedback', icon: MessageSquare },
] as const // Use 'as const' for stricter typing of ids

export const ReportNavMenu = ({ activeSection, onSectionChange }: ReportNavMenuProps) => {
  const handleNavClick = (sectionId: ReportSection) => {
    onSectionChange(sectionId)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <nav className="flex space-x-4 overflow-x-auto py-1 sm:space-x-8" aria-label="Report sections">
          {navItems.map((item) => {
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`
                  group inline-flex shrink-0 whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition-colors duration-150 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                  ${
                    isActive
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                `}
                aria-current={isActive ? 'page' : undefined}
                tabIndex={0}
                aria-label={`View ${item.label} section`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
} 