# TrustPlace Design System

This document outlines the design system for TrustPlace, providing a single source of truth for UI patterns, components, and visual language to maintain consistency across the application.

## Table of Contents

1. [Color System](#color-system)
2. [Typography](#typography)
3. [Spacing & Layout](#spacing--layout)
4. [Shadows & Elevation](#shadows--elevation)
5. [Border Radius](#border-radius)
6. [Component Library](#component-library)
7. [Icons & Visual Elements](#icons--visual-elements)
8. [Safety Metrics Elements](#safety-metrics-elements)
9. [Animation & Motion](#animation--motion)
10. [Best Practices](#best-practices)

## Color System

### Brand Colors

```typescript
const colors = {
  // Primary colors
  primary: {
    50: '#e6f7ff',
    100: '#bae7ff',
    300: '#69c0ff',
    500: '#1890ff', // Primary brand color
    700: '#0050b3',
    900: '#003a8c',
  },
}
```

### Semantic Colors

These colors have specific meanings and are used to communicate status and information:

```typescript
const semanticColors = {
  // Success/safety colors (green spectrum)
  success: {
    50: '#e6f9f0',
    100: '#b7ebce',
    300: '#5dd39e',
    500: '#10b981', // Primary success color (emerald-500)
    700: '#087f58',
    900: '#05603f',
  },
  // Warning colors (yellow spectrum)
  warning: {
    50: '#fff9e6',
    100: '#ffefb8',
    300: '#ffd666',
    500: '#f59e0b', // Primary warning color (amber-500)
    700: '#d48806',
    900: '#ad6800',
  },
  // Alert colors (orange spectrum)
  alert: {
    50: '#fff7ed',
    100: '#ffedd5',
    300: '#fdba74',
    500: '#f97316', // Primary alert color (orange-500)
    700: '#c2410c',
    900: '#7c2d12',
  },
  // Danger colors (red spectrum)
  danger: {
    50: '#fff1f0',
    100: '#ffccc7',
    300: '#ff7875',
    500: '#f43f5e', // Primary danger color (rose-500)
    700: '#cf1322',
    900: '#a8071a',
  },
}
```

### Neutral Colors

Neutral colors are used for text, backgrounds, borders, and other UI elements:

```typescript
const neutralColors = {
  // Neutral colors
  neutral: {
    50: '#fafafa',  // Page background
    100: '#f5f5f5', // Card background (lighter)
    200: '#e8e8e8', // Border light
    300: '#d9d9d9', // Border default
    400: '#bfbfbf', // Border dark / Disabled text
    500: '#8c8c8c', // Secondary text
    600: '#595959', // Primary text
    700: '#434343', // Headings
    800: '#262626', // High contrast text
    900: '#141414', // Extra high contrast text
  },
}
```

### Color Usage Guidelines

- **Text Colors**:
  - Primary text: neutral-600
  - Secondary text: neutral-500
  - Disabled text: neutral-400
  - Headings: neutral-700 to neutral-800

- **Background Colors**:
  - Page background: neutral-50
  - Card background: white or neutral-100
  - Accent backgrounds: Use the 50 variant of semantic colors

- **Border Colors**:
  - Default: neutral-300
  - Light: neutral-200
  - Focus: primary-500

- **Status Colors**:
  - Success/Safe: success-500
  - Warning/Caution: warning-500
  - Alert/High Caution: alert-500
  - Danger/Unsafe: danger-500

- **Safety Score Colors**:
  - 80-100: success-500 (emerald)
  - 60-79: warning-500 (amber) 
  - 40-59: alert-500 (orange)
  - 0-39: danger-500 (rose)

## Typography

### Font Family

```typescript
const fontFamily = {
  sans: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
}
```

### Font Sizes

```typescript
const fontSize = {
  xs: '0.75rem',     // 12px
  sm: '0.875rem',    // 14px
  base: '1rem',      // 16px
  lg: '1.125rem',    // 18px
  xl: '1.25rem',     // 20px
  '2xl': '1.5rem',   // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem',  // 36px
  '5xl': '3rem',     // 48px
}
```

### Font Weights

```typescript
const fontWeight = {
  light: '300',
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
}
```

### Line Heights

```typescript
const lineHeight = {
  none: '1',
  tight: '1.25',
  snug: '1.375',
  normal: '1.5',
  relaxed: '1.625',
  loose: '2',
}
```

### Typography Usage Guidelines

- **Headings**:
  - H1: 2xl-4xl, semibold/bold
  - H2: xl-2xl, semibold
  - H3: lg-xl, medium/semibold
  - H4: base-lg, medium

- **Body Text**:
  - Default: base, normal, neutral-600
  - Secondary: sm-base, normal, neutral-500
  - Small/Caption: xs-sm, normal, neutral-500

- **UI Elements**:
  - Buttons: sm-base, medium/semibold
  - Labels: sm, medium
  - Badges: xs-sm, medium

## Spacing & Layout

### Spacing Scale

```typescript
const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem', // 2px
  1: '0.25rem',    // 4px
  1.5: '0.375rem', // 6px
  2: '0.5rem',     // 8px
  2.5: '0.625rem', // 10px
  3: '0.75rem',    // 12px
  3.5: '0.875rem', // 14px
  4: '1rem',       // 16px
  5: '1.25rem',    // 20px
  6: '1.5rem',     // 24px
  8: '2rem',       // 32px
  10: '2.5rem',    // 40px
  12: '3rem',      // 48px
  16: '4rem',      // 64px
  20: '5rem',      // 80px
  24: '6rem',      // 96px
  32: '8rem',      // 128px
}
```

### Container Width

```typescript
const container = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
}
```

### Spacing Guidelines

- **Component Padding**:
  - Cards: p-6
  - Buttons: px-4 py-2 (md), px-3 py-1.5 (sm)
  - Inputs: px-4 py-2
  - Badges: px-2 py-1 or px-3 py-1

- **Component Margins**:
  - Between sections: my-8
  - Between components: my-4 or my-6
  - Between form elements: my-4
  - Between related items: my-2

- **Grid Gaps**:
  - Default: gap-4
  - Tight: gap-2
  - Loose: gap-6 or gap-8

## Shadows & Elevation

```typescript
const boxShadow = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  DEFAULT: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  none: 'none',
  // Custom shadows
  'card-sm': '0 2px 6px rgba(0, 0, 0, 0.08)',
  'card': '0 4px 12px rgba(0, 0, 0, 0.08)',
}
```

### Elevation Guidelines

- **Level 0**: No shadow (flat elements, disabled states)
- **Level 1**: shadow-sm (subtle elevation, secondary elements)
- **Level 2**: shadow / shadow-card-sm (cards, primary UI elements)
- **Level 3**: shadow-md / shadow-card (floating elements, popovers)
- **Level 4**: shadow-lg (modals, dropdowns)
- **Level 5**: shadow-xl (important UI elements that need emphasis)

## Border Radius

```typescript
const borderRadius = {
  none: '0',
  sm: '0.125rem',      // 2px
  DEFAULT: '0.25rem',  // 4px
  md: '0.375rem',      // 6px
  lg: '0.5rem',        // 8px
  xl: '0.75rem',       // 12px
  '2xl': '1rem',       // 16px
  '3xl': '1.5rem',     // 24px
  full: '9999px',
}
```

### Border Radius Guidelines

- **Small elements**: rounded-md (buttons, input fields)
- **Medium elements**: rounded-lg (cards, alerts)
- **Large elements**: rounded-xl (modals, large cards)
- **Circular elements**: rounded-full (avatars, status indicators)

## Component Library

### Cards

```typescript
// Card variants in Tailwind classes
const cardVariants = {
  default: 'bg-white rounded-xl shadow-card p-6',
  outlined: 'bg-white rounded-xl border border-neutral-200 p-6',
  filled: 'bg-neutral-50 rounded-xl p-6',
  interactive: 'bg-white rounded-xl shadow-card hover:shadow-lg transition-shadow duration-300 cursor-pointer p-6',
}
```

### Buttons

```typescript
// Button variants in Tailwind classes
const buttonVariants = {
  primary: 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-medium rounded-lg px-4 py-2 transition-colors',
  secondary: 'bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-800 font-medium rounded-lg px-4 py-2 transition-colors',
  outline: 'bg-transparent border border-neutral-300 hover:bg-neutral-50 text-neutral-800 font-medium rounded-lg px-4 py-2 transition-colors',
  danger: 'bg-danger-500 hover:bg-danger-600 active:bg-danger-700 text-white font-medium rounded-lg px-4 py-2 transition-colors',
  ghost: 'bg-transparent hover:bg-neutral-100 text-neutral-800 font-medium rounded-lg px-4 py-2 transition-colors',
  link: 'bg-transparent text-primary-500 hover:text-primary-700 hover:underline font-medium transition-colors',
}
```

### Form Elements

```typescript
// Input variants in Tailwind classes
const inputVariants = {
  default: 'w-full px-4 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
  filled: 'w-full px-4 py-2 bg-neutral-50 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white',
}
```

### Badges

```typescript
// Badge variants in Tailwind classes
const badgeVariants = {
  default: 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-primary-50 text-primary-700',
  neutral: 'bg-neutral-100 text-neutral-800',
}
```

## Icons & Visual Elements

We use Lucide icons throughout the application for consistency. Icons should be used sparingly and with purpose.

### Icon Sizes

```typescript
// Icon sizes in Tailwind classes
const iconSizes = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-10 h-10',
}
```

### Icon Usage Guidelines

- Use icons alongside text for clarity
- Maintain consistent sizing based on context
- Use appropriate semantic icons (e.g., CheckCircle for success, AlertTriangle for warning)
- For interactive elements, ensure icons have proper color transitions
- Keep icon colors aligned with the semantic colors

## Safety Metrics Elements

### Risk Level System

```typescript
// Risk level function based on score (0-10)
const getRiskLevel = (score: number) => {
  if (score >= 8) return { 
    label: 'Low Risk', 
    color: 'bg-emerald-500',
    textColor: 'text-emerald-700', 
    lightBg: 'bg-emerald-50',
    border: 'border-emerald-100',
    icon: CheckCircle2,
    description: 'Generally very safe area'
  }
  if (score >= 6) return { 
    label: 'Medium Risk', 
    color: 'bg-amber-500',
    textColor: 'text-amber-700', 
    lightBg: 'bg-amber-50',
    border: 'border-amber-100',
    icon: AlertCircle,
    description: 'Exercise normal caution'
  }
  if (score >= 4) return { 
    label: 'High Risk', 
    color: 'bg-orange-500',
    textColor: 'text-orange-700', 
    lightBg: 'bg-orange-50',
    border: 'border-orange-100',
    icon: AlertTriangle,
    description: 'Exercise increased caution'
  }
  return { 
    label: 'Maximum Risk', 
    color: 'bg-rose-500',
    textColor: 'text-rose-700', 
    lightBg: 'bg-rose-50',
    border: 'border-rose-100',
    icon: ShieldAlert,
    description: 'Extreme caution advised'
  }
}
```

### Safety Score Display

The safety score is displayed in different ways throughout the application:

1. **Overall Score Circle**: A circular display showing the safety score out of 100
2. **Risk Level Badge**: A badge showing the risk level of a metric
3. **Progress Bar**: A colored bar showing the relative safety level
4. **Map Markers**: Colored markers on the map indicating safety score

## Animation & Motion

### Transitions

```typescript
// Transition classes in Tailwind
const transitions = {
  default: 'transition-all duration-300 ease-in-out',
  fast: 'transition-all duration-150 ease-in-out',
  slow: 'transition-all duration-500 ease-in-out',
  none: '',
}
```

### Animation Guidelines

- Use animations sparingly and with purpose
- Keep animations subtle and non-distracting
- Ensure animations are accessible (respect reduced motion settings)
- Use consistent timing and easing for similar interactions

Key animation contexts:
- Hover states: subtle scale or color changes
- Loading states: minimal spinner or pulse animation
- State changes: smooth transitions between states

## Best Practices

### Accessibility

- Maintain sufficient color contrast (WCAG AA minimum)
- Use semantic HTML elements
- Provide text alternatives for non-text content
- Ensure keyboard navigability
- Support screen readers
- Design for various input methods

### Performance

- Optimize images and assets
- Lazy load resources when appropriate
- Use code splitting to reduce bundle size
- Minimize layout shifts
- Use resource hints for critical assets

### Responsive Design

- Design for mobile first, then scale up
- Use flexible layouts with appropriate breakpoints
- Test designs across various screen sizes and devices
- Ensure touch targets are appropriately sized
- Optimize typography for different screen sizes

### Browser Compatibility

- Test across modern browsers
- Use vendor prefixes where necessary
- Ensure graceful degradation for unsupported features

---

## Usage Examples

### Card Component Example

```tsx
<Card className="p-6 rounded-xl shadow-md overflow-hidden">
  <div className="flex items-center gap-2 mb-6">
    <MessageSquare className="w-5 h-5 text-blue-500" />
    <h2 className="text-xl font-semibold text-gray-900">Community Feedback</h2>
  </div>
  
  {/* Card content */}
</Card>
```

### Safety Metric Component Example

```tsx
<div className={`p-4 rounded-xl ${riskLevel.bgColor} border ${riskLevel.border}`}>
  <div className="flex justify-between items-center mb-3">
    <div className="flex items-center gap-2">
      <MetricIcon className={`w-5 h-5 ${riskLevel.textColor}`} />
      <h4 className="font-medium text-gray-800">{safetyQuestion}</h4>
    </div>
    <span className={`px-3 py-1 rounded-full text-sm font-medium ${riskLevel.textColor} bg-white shadow-sm`}>
      {riskLevel.label}
    </span>
  </div>
  
  <div className="mb-3">
    <p className="text-sm text-gray-600">{description}</p>
  </div>
  
  <div className="h-2 bg-white bg-opacity-70 rounded-full overflow-hidden">
    <div 
      className={`h-full ${riskLevel.color} rounded-full transition-all duration-1000 ease-out`}
      style={{ width: `${score * 10}%` }}
    />
  </div>
</div>
```

### Map Marker Example

```tsx
// Create marker
const marker = new mapboxgl.Marker({
  element: createCustomMarker(score, isCurrent)
})
  .setLngLat([longitude, latitude])
  .addTo(map)

// Custom marker styling
<style jsx global>{`
  .custom-marker {
    width: 30px;
    height: 30px;
    cursor: pointer;
    transform: translateY(-15px);
  }
  
  .marker-inner {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .marker-score {
    width: 24px;
    height: 24px;
    border: 2px solid #FFFFFF;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 12px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`}</style>
``` 