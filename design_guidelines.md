# Design Guidelines: Mailing List Filter & Selection Tool

## Design Approach
**System-Based Approach**: Drawing from Material Design and modern data-focused applications (Airtable, Notion databases, Google Analytics filters). This is a utility-first tool prioritizing clarity, efficiency, and learnability over visual flair.

## Core Design Principles
1. **Clarity over decoration** - Every element serves a functional purpose
2. **Immediate feedback** - Real-time count updates as filters are applied
3. **Progressive disclosure** - Show complexity only when needed
4. **Scannable hierarchy** - Quick visual parsing of filter states and results

## Layout System

**Spacing**: Use Tailwind units of 3, 4, 6, and 8 for consistent rhythm (p-4, gap-6, m-8, etc.)

**Page Structure**:
- Fixed header with app title and action buttons (h-16)
- Main content area: Two-column layout on desktop (lg:grid-cols-[2fr_1fr])
  - Left: Filter panel (scrollable)
  - Right: Results summary panel (sticky)
- Mobile: Single column, stacked layout

**Container**: max-w-7xl mx-auto with px-4 md:px-6 padding

## Typography

**Font Stack**: Inter or System UI fonts via Google Fonts
- **Headings**: font-semibold, text-lg to text-2xl
- **Body/Labels**: font-medium, text-sm to text-base
- **Counts/Numbers**: font-bold, text-xl to text-3xl (emphasize data)
- **Helper text**: text-xs to text-sm, reduced opacity

## Component Library

### Filter Controls
**Multi-select Dropdowns**: Custom styled select elements with checkboxes inside
- Shows selected count badge when filters active
- Searchable for long lists (cities, zipcodes)

**Range Sliders**: For numeric filters (LTV, order amount, date ranges)
- Display min/max values below slider
- Show current selection in real-time

**Date Pickers**: Calendar popover for date range selection
- Quick presets (Last 30 days, Last quarter, etc.)

**Filter Cards**: Each filter type in a card/panel with:
- Filter name as header
- Control element (dropdown/slider/picker)
- Active state indicator
- Clear individual filter button

### Results Panel (Sticky Sidebar)
**Count Display**:
- Large prominent number showing total matches
- Secondary metrics (% of database, comparison to previous)
- Visual indicator (icon) when count changes

**Active Filters Summary**:
- Compact chips showing applied filters
- One-click removal per filter
- "Clear all" button when multiple active

**Action Buttons**:
- Primary: "Generate Mailing List" (prominent, disabled when count = 0)
- Secondary: "Save Filter Preset" for reuse

### Data Visualization
**Simple Bar Charts**: Show distribution across selected dimensions
- Horizontal bars for quick scanning
- Appears when single filter selected to show breakdown

## Interaction Patterns

**Filter Application**: Immediate (no "Apply" button needed)
- Debounced updates (300ms) for text inputs
- Instant for selections/toggles

**Loading States**: Subtle spinner in results panel during count calculations

**Empty States**: 
- "No results" with suggestion to adjust filters
- "No filters applied" with prompt to begin

**Success State**: Brief confirmation toast when mailing list generated

## Navigation
**Top Bar**:
- App logo/title (left)
- Export/Settings icon buttons (right)
- Breadcrumb if nested views needed

**No traditional sidebar** - maximize filter panel space

## Forms & Inputs
**Consistent styling across all inputs**:
- Clear borders, rounded corners (rounded-md)
- Focus states with ring (ring-2)
- Adequate padding (p-3) for touch targets
- Labels always visible, helper text below

## Images
**No hero images needed** - This is a functional dashboard tool
**Icons only**: Use Heroicons for filter types, actions, and states (via CDN)

## Accessibility
- All filters keyboard navigable
- ARIA labels for count updates (screen reader announcements)
- Focus visible styles
- Minimum touch target 44x44px
- High contrast for all interactive elements

## Animations
**Minimal, purposeful only**:
- Count number transitions (animate digits incrementing/decrementing)
- Smooth panel slides when toggling filters
- Subtle fade for loading states
**Duration**: 200-300ms max, ease-in-out

## Key Design Distinctions
- **Not a spreadsheet clone** - Focused interface, not overwhelming data grid
- **Summary-first approach** - Counts before details, preventing information overload
- **Confidence building** - Always show impact of selections before committing
- **Reversible actions** - Easy to undo/modify without starting over