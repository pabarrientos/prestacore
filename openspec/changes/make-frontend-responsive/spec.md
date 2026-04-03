# Spec: Responsive Design System

## 1. Requirements

### 1.1 Functional Requirements

**FR-1: Mobile-First Layout (320px–639px)**
- All pages render without horizontal page scroll on 320px viewport (iPhone SE)
- All multi-column grids collapse to single column (`grid-cols-1`)
- All tables are horizontally scrollable within their container (`overflow-x-auto`)
- Navigation bars stack vertically or wrap gracefully
- Action button rows wrap to multiple lines
- Form inputs span full width
- Touch targets are minimum 44x44px

**FR-2: Tablet Layout (640px–1023px)**
- Two-column grids activate (`sm:grid-cols-2`)
- Navigation bars transition to horizontal with wrapping
- Headers transition from stacked to side-by-side layout
- Tables remain scrollable if they exceed container width

**FR-3: Desktop Layout (1024px+)**
- Three-column and four-column grids activate (`lg:grid-cols-3`, `lg:grid-cols-4`)
- Multi-panel layouts (form + simulation) display side-by-side
- All existing desktop layouts preserved exactly as current state

**FR-4: Large Desktop (1536px+)**
- Content remains centered within `max-w-7xl` container
- No excessive stretching of text or form inputs

### 1.2 Non-Functional Requirements

**NFR-1: Performance**
- Zero Cumulative Layout Shift (CLS) — responsive classes are purely CSS, no JS-driven layout changes
- No additional bundle size — only Tailwind utility classes, no new dependencies
- No runtime JavaScript for responsive behavior (pure CSS media queries via Tailwind)

**NFR-2: Dark Mode Preservation**
- All existing `dark:` variants remain functional at every breakpoint
- No new dark mode classes introduced that could conflict with existing ones
- Theme toggle behavior unchanged

**NFR-3: Accessibility**
- All interactive elements have minimum 44x44px touch targets on mobile (via `min-h-[44px]` or `min-w-[44px]`)
- Text remains readable at all breakpoints (minimum 14px base, 16px for inputs)
- Color contrast ratios preserved at all breakpoints
- Focus states visible at all breakpoints

**NFR-4: Browser Support**
- Works on all browsers supported by Tailwind CSS v3.4.1
- No CSS features requiring vendor prefixes beyond Tailwind's autoprefixer

---

## 2. Responsive Design System

### 2.1 Breakpoints (Tailwind Defaults)

| Token | Min-width | Target Device |
|-------|-----------|---------------|
| `sm`  | 640px     | Mobile landscape |
| `md`  | 768px     | Tablet portrait |
| `lg`  | 1024px    | Laptop |
| `xl`  | 1280px    | Desktop |
| `2xl` | 1536px    | Large desktop |

### 2.2 Standard Patterns

These patterns are applied consistently across ALL pages:

| Pattern | Mobile (<640px) | Tablet (640px+) | Desktop (1024px+) |
|---------|-----------------|-----------------|-------------------|
| Container padding | `px-4` | `sm:px-6` | `lg:px-8` |
| Page padding | `py-4` | `md:py-6` | `lg:py-8` |
| Card padding | `p-4` | `sm:p-6` | — |
| 2-col grid | `grid-cols-1` | `sm:grid-cols-2` | — |
| 3-col grid | `grid-cols-1` | `sm:grid-cols-2` | `lg:grid-cols-3` |
| 4-col grid | `grid-cols-1` | `sm:grid-cols-2` | `lg:grid-cols-4` |
| Table wrapper | `overflow-x-auto -mx-4 sm:mx-0` | — | — |
| Header flex | `flex flex-col gap-4` | `sm:flex-row sm:items-center sm:justify-between` | — |
| Heading (h1) | `text-2xl` | `md:text-3xl` | `lg:text-4xl` |
| Subheading (h2) | `text-lg` | `md:text-xl` | — |
| Modal container | `w-full max-w-md sm:max-w-lg md:max-w-2xl lg:max-w-4xl` | — | — |
| Button row | `flex flex-col gap-2` | `sm:flex-row sm:gap-4` | — |
| Filter/search input | `w-full` | `md:w-64` or `md:w-80` | — |

---

## 3. Per-Page Specifications

### 3.1 `app/page.tsx` (Landing Page)

**Current Issues:**
- `p-8` padding too large on mobile
- `text-5xl` heading too large on mobile
- `md:grid-cols-3` grid has no mobile fallback (defaults to single column OK, but no explicit `grid-cols-1`)
- Button row has fixed `gap-4` with no mobile adjustment

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Main container padding | `p-8` | `p-4 sm:p-6 md:p-8` |
| H1 heading | `text-5xl` | `text-3xl sm:text-4xl md:text-5xl` |
| Description text | `text-xl` | `text-base sm:text-lg md:text-xl` |
| Card grid | `grid md:grid-cols-3` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Card padding | `p-6` | `p-4 sm:p-6` |
| Card heading | `text-xl` | `text-lg sm:text-xl` |
| Button row | `flex gap-4 justify-center` | `flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center` |
| Buttons | `px-6 py-3` | `px-6 py-3 min-h-[44px]` |

### 3.2 `app/login/page.tsx`

**Current State:** Already responsive — uses `max-w-md`, single-column form, `p-8` padding.

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Main padding | `p-8` | `p-4 sm:p-6 md:p-8` |
| H1 heading | `text-3xl` | `text-2xl sm:text-3xl` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Submit button | `py-3` | `py-3 min-h-[44px]` |

### 3.3 `app/register/page.tsx`

**Current Issues:**
- `p-8` padding too large on mobile
- `grid-cols-2` for name fields has no mobile fallback — breaks on <640px

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Main padding | `p-8` | `p-4 sm:p-6 md:p-8` |
| H1 heading | `text-3xl` | `text-2xl sm:text-3xl` |
| Name fields grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Submit button | `py-3` | `py-3 min-h-[44px]` |

### 3.4 `app/admin/layout.tsx` (Admin Layout)

**Current Issues:**
- Top nav `flex justify-between h-16` does not wrap — title + user info + buttons overflow on mobile
- Secondary nav `flex space-x-4 pb-3` does not wrap — links overflow on mobile
- User info text ("FirstName LastName (ROLE)") is too long for mobile

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Top nav inner div | `flex justify-between h-16` | `flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-3 sm:h-16 sm:py-0` |
| Title area | `flex items-center` | `flex flex-wrap items-center gap-2` |
| User info span | `ml-4 text-sm` | `text-sm` (remove `ml-4`, use gap on parent) |
| Top nav actions | `flex items-center` | `flex flex-wrap items-center gap-1` |
| Nav action links | `px-3 py-2` | `px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center` |
| Secondary nav | `flex space-x-4 pb-3` | `flex flex-wrap gap-x-4 gap-y-1 pb-3` |
| Secondary nav links | text only | `py-2 min-h-[44px] flex items-center` |

### 3.5 `app/admin/page.tsx` (Dashboard)

**Current State:** Already responsive — uses `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` for metric cards, `grid-cols-2 md:grid-cols-5` for distributions, `grid-cols-1 md:grid-cols-4` for quick actions.

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change needed) |
| Metric card values | `text-3xl` | `text-2xl sm:text-3xl` |
| Distribution cards | `text-2xl` | `text-xl sm:text-2xl` |
| Quick action cards | `p-6` | `p-4 sm:p-6` |
| Quick action heading | `text-lg` | `text-base sm:text-lg` |

### 3.6 `app/admin/loans/page.tsx` (Loans List)

**Current Issues:**
- Header `flex justify-between items-center` does not wrap on mobile
- Table has NO `overflow-x-auto` wrapper — 7-column table overflows on mobile
- Filter input `w-full md:w-64` is OK but needs mobile padding

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Header div | `flex justify-between items-center mb-6` | `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6` |
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| New loan button | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Filter input | `px-4 py-2 border rounded-lg w-full md:w-64` | `px-4 py-2 border rounded-lg w-full md:w-64 min-h-[44px]` |
| Table container | `bg-white rounded-lg shadow overflow-hidden` | `bg-white rounded-lg shadow overflow-hidden` + wrap `<table>` in `<div class="overflow-x-auto -mx-4 sm:mx-0">` |
| Table wrapper div | (does not exist) | Add: `<div className="overflow-x-auto -mx-4 sm:mx-0">` around the `<table>` element, inside the existing `overflow-hidden` container |

**Note:** The table wrapper must be placed INSIDE the `overflow-hidden` card. The pattern is:
```
<div className="bg-white rounded-lg shadow overflow-hidden">
  <div className="overflow-x-auto -mx-4 sm:mx-0">
    <table className="min-w-full ...">
```

### 3.7 `app/admin/loans/new/page.tsx` (New Loan Form)

**Current Issues:**
- `grid-cols-1 lg:grid-cols-2` for form + simulation panel — on mobile, single column is correct
- Inner form grid `grid-cols-2` for term/frequency has no mobile fallback
- Simulation panel inner grid `grid-cols-2` has no mobile fallback
- Button row `flex gap-4` does not wrap on mobile
- Form card `p-6` padding too large on mobile

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Form card padding | `p-6` | `p-4 sm:p-6` |
| Term/frequency grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Frequency/rate grid (edit page) | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Simulation panel padding | `p-6` | `p-4 sm:p-6` |
| Simulation inner grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Installment amount display | `text-2xl` | `text-xl sm:text-2xl` |
| Total display | `text-2xl` | `text-xl sm:text-2xl` |
| Button row | `flex gap-4` | `flex flex-col sm:flex-row gap-2 sm:gap-4` |
| Buttons | `py-2` | `py-2 min-h-[44px]` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Select fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |

### 3.8 `app/admin/loans/[id]/page.tsx` (Loan Detail)

**Current Issues:**
- Header `flex items-center justify-between` does not wrap — action button row overflows (up to 5 buttons!)
- Info card grid `grid-cols-2 md:grid-cols-4` is OK but card padding `p-6` too large on mobile
- Payment history table already has `overflow-x-auto` — verify
- Installments table already has `overflow-x-auto` — verify
- Modal containers already have `p-4` on overlay — verify max-width

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Header outer div | `flex items-center justify-between mb-6` | `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6` |
| Action button row | `flex gap-2` | `flex flex-wrap gap-2` |
| Action buttons | `px-4 py-2` | `px-3 py-2 min-h-[44px] text-sm` |
| Info card padding | `p-6` | `p-4 sm:p-6` |
| Info card grid | `grid grid-cols-2 md:grid-cols-4 gap-4` | `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` |
| Info card values | `text-xl` / `text-lg` | `text-lg sm:text-xl` / `text-base sm:text-lg` |
| Client info card | same as info card | same changes as info card |
| Installments table wrapper | Already has `overflow-x-auto` | No change needed |
| Payment history table wrapper | Already has `overflow-x-auto` | No change needed |
| Payment history header | `flex justify-between items-center` | `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2` |
| Payment modal overlay | `fixed inset-0 ... p-4` | No change (already has p-4) |
| Payment modal content | `max-w-lg w-full` | `w-full max-w-lg` (no change needed) |
| Refinancing modal content | `max-w-4xl w-full` | `w-full max-w-lg sm:max-w-2xl md:max-w-4xl` |
| Cancelacion modal content | `max-w-2xl w-full` | `w-full max-w-lg md:max-w-2xl` |

### 3.9 `app/admin/loans/[id]/edit/page.tsx` (Edit Loan)

**Current Issues:**
- Same grid issues as new loan page
- Same button row issues
- Same form padding issues

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Form card padding | `p-6` | `p-4 sm:p-6` |
| Amount/term grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Frequency/rate grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Simulation panel padding | `p-6` | `p-4 sm:p-6` |
| Simulation inner grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Button row | `flex gap-4` | `flex flex-col sm:flex-row gap-2 sm:gap-4` |
| Buttons | `py-2` | `py-2 min-h-[44px]` |
| Input/select fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |

### 3.10 `app/admin/clients/page.tsx` (Clients List)

**Current Issues:**
- Header `flex justify-between items-center` does not wrap
- Table has NO `overflow-x-auto` wrapper — 7-column table overflows
- Action column uses `flex flex-col gap-1` — already mobile-friendly for buttons

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Header div | `flex justify-between items-center mb-6` | `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6` |
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| New client button | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Filter input | `px-4 py-2 border rounded-lg w-full md:w-80` | `px-4 py-2 border rounded-lg w-full md:w-80 min-h-[44px]` |
| Table container | `bg-white rounded-lg shadow overflow-hidden` | Add `<div className="overflow-x-auto -mx-4 sm:mx-0">` around `<table>` |
| Action links | already `flex flex-col gap-1` | Add `min-h-[44px]` to each link/button via wrapper or padding |

### 3.11 `app/admin/clients/new/page.tsx` (New Client Form)

**Current Issues:**
- ALL `grid-cols-2` grids have no mobile fallback (5 locations)
- Form has `max-w-2xl` which is fine, but `p-6` padding too large on mobile
- Button row `flex gap-4` does not wrap

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Form card padding | `p-6` | `p-4 sm:p-6` |
| Email/password grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Name fields grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| DNI/birthdate grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Phone/city grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Occupation/employer grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Button row | `flex gap-4 pt-4` | `flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4` |
| Submit button | `py-2` | `py-2 min-h-[44px]` |
| Cancel button | `py-2 px-4` | `py-2 px-4 min-h-[44px]` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |

### 3.12 `app/admin/clients/[id]/page.tsx` (Edit Client)

**Current Issues:**
- Same grid issues as new client page (5 locations)
- Same button row issues
- Same form padding issues
- Note: Email field is in a `grid-cols-2` but only has ONE child — this is wasteful but we keep the grid structure for consistency

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Form card padding | `p-6` | `p-4 sm:p-6` |
| Email grid (single child) | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Name fields grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| DNI/birthdate grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Phone/city grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Occupation/employer grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Button row | `flex gap-4 pt-4` | `flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4` |
| Buttons | `py-2` | `py-2 min-h-[44px]` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |

### 3.13 `app/admin/overdue/page.tsx` (Overdue Installments)

**Current Issues:**
- Summary cards `grid-cols-1 md:grid-cols-3` — OK but card padding `p-6` too large on mobile
- Distribution grid `grid-cols-2 md:grid-cols-5` — OK
- Filters form `flex flex-wrap gap-4` — already wraps, but buttons need min-height
- Table already has `overflow-x-auto` — verify (yes, line 213)
- Payment modal already responsive — verify

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Summary card padding | `p-6` | `p-4 sm:p-6` |
| Summary card values | `text-2xl` | `text-xl sm:text-2xl` |
| Distribution card | `p-3` | `p-3` (no change, already small) |
| Filter form | `flex flex-wrap gap-4 items-end` | `flex flex-wrap gap-3 sm:gap-4 items-end` |
| Filter inputs | `px-3 py-2` | `px-3 py-2 min-h-[44px]` |
| Filter buttons | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Table | Already has `overflow-x-auto` | No change needed |
| Payment modal | Already has `p-4` overlay + `max-w-md` | No change needed |

### 3.14 `app/admin/settings/page.tsx` (Settings)

**Current Issues:**
- Rate settings use `grid md:grid-cols-2 gap-4` — OK but card padding `p-6` too large on mobile
- Input+button groups `flex gap-2` overflow on very narrow screens — button text "Guardar" gets cut off
- Theme selector buttons `flex gap-3` may overflow on very narrow screens
- Loan limits section same issues

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| H1 heading | `text-2xl` | `text-2xl` (no change) |
| Card padding | `p-6` | `p-4 sm:p-6` |
| Rate settings grid | `grid md:grid-cols-2 gap-4` | `grid grid-cols-1 md:grid-cols-2 gap-4` |
| Input+button groups | `flex gap-2` | `flex flex-col sm:flex-row gap-2` |
| "Guardar" buttons | `px-4 py-2` | `px-4 py-2 min-h-[44px] w-full sm:w-auto` |
| Input fields in groups | `flex-1` | `flex-1 min-h-[44px]` |
| Loan limits grid | `grid md:grid-cols-2 gap-4` | `grid grid-cols-1 md:grid-cols-2 gap-4` |
| Mora section input+button | `flex gap-2` | `flex flex-col sm:flex-row gap-2` |
| Timezone section | `flex gap-2` | `flex flex-col sm:flex-row gap-2` |
| Theme selector buttons | `flex gap-3` | `flex flex-wrap gap-2 sm:gap-3` |
| Theme buttons | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |

### 3.15 `app/simulator/page.tsx` (Loan Simulator)

**Current Issues:**
- `p-8` padding too large on mobile
- `text-3xl` heading too large on mobile
- `md:grid-cols-2` grid has no explicit mobile fallback
- Form card `p-6` padding too large on mobile
- Results card `p-6` padding too large on mobile
- Amortization table already has `overflow-x-auto` — verify (yes, line 342)

**Changes Required:**

| Element | Current | New |
|---------|---------|-----|
| Main padding | `p-8` | `p-4 sm:p-6 md:p-8` |
| H1 heading | `text-3xl` | `text-2xl sm:text-3xl` |
| Form/results grid | `grid md:grid-cols-2 gap-8` | `grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8` |
| Form card padding | `p-6` | `p-4 sm:p-6` |
| Results card padding | `p-6` | `p-4 sm:p-6` |
| Form heading | `text-xl` | `text-lg sm:text-xl` |
| Results heading | `text-xl` | `text-lg sm:text-xl` |
| Installment display | `text-3xl` | `text-2xl sm:text-3xl` |
| Results inner grid | `grid grid-cols-2 gap-4` | `grid grid-cols-1 sm:grid-cols-2 gap-4` |
| Calculate button | `py-3` | `py-3 min-h-[44px]` |
| Input fields | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Select field | `px-4 py-2` | `px-4 py-2 min-h-[44px]` |
| Amortization table | Already has `overflow-x-auto` | No change needed |
| Amortization card | `p-6` | `p-4 sm:p-6` |

---

## 4. Acceptance Criteria

### Phase 1: Critical Table Fixes

| # | Criteria | Verification Method |
|---|----------|-------------------|
| AC-1.1 | Loans table (`/admin/loans`) scrolls horizontally on viewport < 768px | Resize browser to 375px, verify table scrolls within container, no page-level horizontal scroll |
| AC-1.2 | Clients table (`/admin/clients`) scrolls horizontally on viewport < 768px | Same as AC-1.1 |
| AC-1.3 | Overdue table (`/admin/overdue`) scrolls horizontally on viewport < 768px | Same as AC-1.1 |
| AC-1.4 | Loan detail tables (`/admin/loans/[id]`) scroll horizontally on viewport < 768px | Same as AC-1.1 |
| AC-1.5 | No horizontal page scroll on any table page at 375px | Use browser dev tools, verify `document.documentElement.scrollWidth <= window.innerWidth` |

### Phase 2: Navigation & Layout

| # | Criteria | Verification Method |
|---|----------|-------------------|
| AC-2.1 | Admin top nav wraps on viewport < 640px | Resize to 375px, verify title, user info, and buttons stack or wrap |
| AC-2.2 | Admin secondary nav wraps on viewport < 768px | Resize to 640px, verify nav links wrap to multiple lines |
| AC-2.3 | Landing page heading scales responsively | Verify at 375px: `text-3xl`, at 768px: `text-4xl`, at 1024px: `text-5xl` |
| AC-2.4 | Landing page cards stack on mobile | At 375px: 1 column, at 640px: 2 columns, at 1024px: 3 columns |
| AC-2.5 | Landing page buttons stack on mobile | At 375px: vertical stack, at 640px: horizontal row |

### Phase 3: Form Grids

| # | Criteria | Verification Method |
|---|----------|-------------------|
| AC-3.1 | All 2-column form grids collapse to 1 column on viewport < 640px | Test each form page at 375px |
| AC-3.2 | All 2-column form grids expand to 2 columns on viewport >= 640px | Test each form page at 768px |
| AC-3.3 | Form + simulation panels stack on mobile (`/admin/loans/new`, `/admin/loans/[id]/edit`) | At 375px: single column, at 1024px: side-by-side |
| AC-3.4 | All form buttons are minimum 44px tall on mobile | Inspect computed styles at 375px |
| AC-3.5 | All form inputs are minimum 44px tall on mobile | Inspect computed styles at 375px |

### Phase 4: Polish & Consistency

| # | Criteria | Verification Method |
|---|----------|-------------------|
| AC-4.1 | Settings page input+button groups stack on viewport < 640px | At 375px: input above button, at 640px: side-by-side |
| AC-4.2 | Dashboard metric cards display correctly at all breakpoints | 375px: 1 col, 768px: 2 col, 1024px: 4 col |
| AC-4.3 | Simulator page form and results stack on mobile | At 375px: single column, at 768px: side-by-side |
| AC-4.4 | Dark mode renders correctly on all pages at all breakpoints | Toggle dark mode at 375px, 768px, 1024px on each page |
| AC-4.5 | `pnpm --filter @prestamos/web build` succeeds with no errors | Run build command |
| AC-4.6 | No TypeScript errors after changes | Run `pnpm --filter @prestamos/web type-check` or equivalent |

---

## 5. Edge Cases

### 5.1 Very Narrow Screens (< 320px)
- **Risk**: Some content may still overflow at extreme narrow widths
- **Mitigation**: All text uses `break-words` implicitly via Tailwind defaults; tables use `overflow-x-auto`; buttons use `min-h-[44px]` with `w-full sm:w-auto` pattern for settings page
- **Test**: Resize to 320px, verify no horizontal page scroll

### 5.2 Tablet Portrait vs Landscape
- **Risk**: 768px portrait iPad may have different usable width than 1024px landscape
- **Mitigation**: `sm` breakpoint (640px) handles most tablet cases; `md` (768px) adds refinements; `lg` (1024px) for full desktop
- **Test**: Test at 768x1024 (portrait) and 1024x768 (landscape)

### 5.3 Large Desktops (> 1920px)
- **Risk**: Content stretches too wide, lines become too long to read
- **Mitigation**: All pages use `max-w-7xl mx-auto` or `max-w-4xl` / `max-w-5xl` containers; admin layout uses `max-w-7xl`
- **Test**: Resize to 1920px and 2560px, verify content stays centered and readable

### 5.4 Orientation Changes
- **Risk**: Rapid orientation changes may cause layout thrashing
- **Mitigation**: Pure CSS responsive design — no JavaScript layout calculations, so orientation changes are instant
- **Test**: Rotate device emulator between portrait/landscape, verify smooth transition

### 5.5 Long Content in Tables
- **Risk**: Very long client names, email addresses, or notes may cause table cells to expand
- **Mitigation**: Tables already use `whitespace-nowrap` on most cells; `overflow-x-auto` handles any overflow
- **Test**: Verify with longest possible data values

### 5.6 Modal Overlays on Mobile
- **Risk**: Modal content may exceed viewport height on small screens
- **Mitigation**: All modals already use `p-4` on overlay; payment modal uses `max-h-[90vh] overflow-y-auto`; refinancing and cancelacion modals use responsive `max-w-*` classes
- **Test**: Open each modal at 375px viewport, verify content scrolls within modal

---

## 6. Accessibility Requirements

### 6.1 Touch Targets
- All interactive elements (buttons, links, inputs) must have minimum **44x44px** touch target on mobile
- Achieved via `min-h-[44px]` class on buttons and inputs
- Links in action columns use `py-2` (8px) which is insufficient — must add `min-h-[44px]` or use padding adjustment

### 6.2 No Horizontal Page Scroll
- The `<body>` and all page-level containers must NOT scroll horizontally
- Only table containers may have horizontal scroll (via `overflow-x-auto`)
- Verified by: `document.documentElement.scrollWidth <= window.innerWidth` at all breakpoints

### 6.3 Readable Text
- Base text size: minimum **14px** (`text-sm`) for body text
- Input text: minimum **16px** (browser default, prevents iOS zoom on focus)
- Headings scale responsively but never below `text-2xl` (24px) for h1, `text-lg` (18px) for h2

### 6.4 Focus States
- All focus states preserved at all breakpoints
- `focus:ring-2 focus:ring-primary-500` on inputs — no changes needed
- Keyboard navigation order unchanged (DOM order preserved)

### 6.5 Color Contrast
- All existing color contrast ratios preserved
- No new color classes introduced that could reduce contrast
- Dark mode contrast ratios unchanged

---

## 7. Implementation Notes

### 7.1 What NOT to Change
- **No logic changes**: Only Tailwind class modifications
- **No component extraction**: Keep existing component structure
- **No new dependencies**: Pure Tailwind utility classes
- **No dark mode changes**: All existing `dark:` variants preserved
- **No API changes**: Backend untouched

### 7.2 Class Addition Strategy
- **Additive only**: Never remove existing desktop classes, only add responsive prefixes
- Example: Change `grid-cols-2` to `grid-cols-1 sm:grid-cols-2` (not `sm:grid-cols-2` alone)
- Example: Change `p-6` to `p-4 sm:p-6` (not `sm:p-6` alone)

### 7.3 Testing Strategy
- Manual testing via browser dev tools at breakpoints: 320px, 375px, 640px, 768px, 1024px, 1280px, 1920px
- Verify each page individually
- Verify dark mode at each breakpoint
- Verify no TypeScript errors
- Verify build succeeds

### 7.4 Files Modified (Complete List)

| # | File | Phase | Estimated Changes |
|---|------|-------|------------------|
| 1 | `apps/web/src/app/page.tsx` | 2 | 6 class changes |
| 2 | `apps/web/src/app/login/page.tsx` | 4 | 4 class changes |
| 3 | `apps/web/src/app/register/page.tsx` | 3 | 5 class changes |
| 4 | `apps/web/src/app/admin/layout.tsx` | 2 | 8 class changes |
| 5 | `apps/web/src/app/admin/page.tsx` | 4 | 5 class changes |
| 6 | `apps/web/src/app/admin/loans/page.tsx` | 1 | 5 class changes + 1 wrapper |
| 7 | `apps/web/src/app/admin/loans/new/page.tsx` | 3 | 10 class changes |
| 8 | `apps/web/src/app/admin/loans/[id]/page.tsx` | 1 | 12 class changes |
| 9 | `apps/web/src/app/admin/loans/[id]/edit/page.tsx` | 3 | 10 class changes |
| 10 | `apps/web/src/app/admin/clients/page.tsx` | 1 | 5 class changes + 1 wrapper |
| 11 | `apps/web/src/app/admin/clients/new/page.tsx` | 3 | 12 class changes |
| 12 | `apps/web/src/app/admin/clients/[id]/page.tsx` | 3 | 12 class changes |
| 13 | `apps/web/src/app/admin/overdue/page.tsx` | 1 | 6 class changes |
| 14 | `apps/web/src/app/admin/settings/page.tsx` | 4 | 15 class changes |
| 15 | `apps/web/src/app/simulator/page.tsx` | 3 | 12 class changes |

**Total**: 15 files, approximately 127 class modifications, 2 new wrapper divs.
