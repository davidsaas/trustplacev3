import React from 'react';

// Define the base sections
export type ReportSection = 'overview' | 'map' | 'safety' | 'community' | 'activities';
// Define the extended sections including the new one
export type ExtendedReportSection = ReportSection | 'neighborhood';

// Update props to use ExtendedReportSection consistently
interface ReportNavMenuProps {
  activeSection: ExtendedReportSection;
  onSectionChange: (section: ExtendedReportSection) => void;
  sections: ExtendedReportSection[];
}

// Map section keys to display names (already includes neighborhood)
const sectionLabels: Record<ExtendedReportSection, string> = {
  overview: 'Overview',
  map: 'Map View',
  safety: 'Safety Analysis',
  neighborhood: 'Neighborhood',
  community: 'Community',
  activities: 'Activities',
};


function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// Component signature uses updated props type
export const ReportNavMenu = ({ activeSection, onSectionChange, sections }: ReportNavMenuProps) => {
  return (
    <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs"> {/* Added overflow-x-auto for smaller screens */}
      {sections.map((section) => (
        <button
          key={section}
          onClick={() => onSectionChange(section)}
          className={classNames(
            section === activeSection
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
            'whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500'
          )}
          aria-current={section === activeSection ? 'page' : undefined}
          role="tab"
          aria-selected={section === activeSection}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSectionChange(section); }}
        >
          {sectionLabels[section] || section}
        </button>
      ))}
    </nav>
  );
}; 