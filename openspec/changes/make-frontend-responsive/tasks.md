# Tasks: Make Frontend Responsive

## Phase 1: Critical Table Overflows & Navigation

> **Goal**: Eliminate horizontal page scroll on all table pages and make admin navigation usable on mobile.

### T001 — Add `overflow-x-auto` wrapper to loans table
- **file**: `apps/web/src/app/admin/loans/page.tsx`
- **description**: Wrap the `<table>` element inside the `bg-white rounded-lg shadow overflow-hidden` card with `<div className="overflow-x-auto -mx-4 sm:mx-0">`. Also change the page header from `flex justify-between items-center mb-6` to `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6`. Add `min-h-[44px]` to the "Nuevo Préstamo" button and filter input.
- **depends_on**: []

### T002 — Add `overflow-x-auto` wrapper to clients table
- **file**: `apps/web/src/app/admin/clients/page.tsx`
- **description**: Wrap the `<table>` element inside the `bg-white rounded-lg shadow overflow-hidden` card with `<div className="overflow-x-auto -mx-4 sm:mx-0">`. Change the page header from `flex justify-between items-center mb-6` to `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6`. Add `min-h-[44px]` to the "Nuevo Cliente" button and filter input.
- **depends_on**: []

### T003 — Make admin top nav responsive
- **file**: `apps/web/src/app/admin/layout.tsx`
- **description**: (1) Change top nav inner div from `flex justify-between h-16` to `flex flex-col sm:flex-row sm:justify-between sm:items-center h-auto sm:h-16 py-2 sm:py-0`. (2) Change left section from `flex items-center` to `flex flex-wrap items-center gap-2`. (3) Hide user info span on mobile: change `ml-4 text-sm` to `hidden sm:inline text-sm` (remove `ml-4`, gap handled by parent). (4) Change right actions from `flex items-center` to `flex flex-wrap items-center gap-1`. (5) Add `min-h-[44px] min-w-[44px] flex items-center justify-center` to nav action links.
- **depends_on**: []

### T004 — Make admin secondary nav wrap
- **file**: `apps/web/src/app/admin/layout.tsx`
- **description**: Change secondary nav from `flex space-x-4 pb-3` to `flex flex-wrap gap-x-4 gap-y-1 pb-3`. Add `py-2 min-h-[44px] flex items-center` to each nav link.
- **depends_on**: [T003]

### T005 — Make loan detail action buttons wrap
- **file**: `apps/web/src/app/admin/loans/[id]/page.tsx`
- **description**: (1) Change page header from `flex items-center justify-between mb-6` to `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6`. (2) Change action button row from `flex gap-2` to `flex flex-wrap gap-2`. (3) Change action buttons from `px-4 py-2` to `px-3 py-2 min-h-[44px] text-sm`. (4) Change info card grid from `grid grid-cols-2 md:grid-cols-4 gap-4` to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`. (5) Change card padding from `p-6` to `p-4 sm:p-6`. (6) Apply same grid and padding changes to client info card. (7) Change payment history header from `flex justify-between items-center` to `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`. (8) Change refinancing modal from `max-w-4xl w-full` to `w-full max-w-lg sm:max-w-2xl md:max-w-4xl`. (9) Change cancelación modal from `max-w-2xl w-full` to `w-full max-w-lg md:max-w-2xl`.
- **depends_on**: []

### T006 — Verify and polish overdue page
- **file**: `apps/web/src/app/admin/overdue/page.tsx`
- **description**: (1) Change summary card padding from `p-6` to `p-4 sm:p-6`. (2) Change summary card values from `text-2xl` to `text-xl sm:text-2xl`. (3) Change filter form from `flex flex-wrap gap-4 items-end` to `flex flex-wrap gap-3 sm:gap-4 items-end`. (4) Add `min-h-[44px]` to filter inputs (`px-3 py-2` → `px-3 py-2 min-h-[44px]`). (5) Add `min-h-[44px]` to filter buttons (`px-4 py-2` → `px-4 py-2 min-h-[44px]`). Verify table already has `overflow-x-auto` (spec says yes, line 213).
- **depends_on**: []

---

## Phase 2: Form Responsiveness

> **Goal**: All 2-column form grids collapse to single column on mobile, button rows wrap, inputs meet 44px touch target.

### T007 — Make new loan form responsive
- **file**: `apps/web/src/app/admin/loans/new/page.tsx`
- **description**: (1) Change form card padding `p-6` → `p-4 sm:p-6`. (2) Change term/frequency grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (3) Change simulation panel padding `p-6` → `p-4 sm:p-6`. (4) Change simulation inner grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (5) Change installment amount display `text-2xl` → `text-xl sm:text-2xl`. (6) Change total display `text-2xl` → `text-xl sm:text-2xl`. (7) Change button row `flex gap-4` → `flex flex-col sm:flex-row gap-2 sm:gap-4`. (8) Add `min-h-[44px]` to all buttons (`py-2` → `py-2 min-h-[44px]`). (9) Add `min-h-[44px]` to all input and select fields (`px-4 py-2` → `px-4 py-2 min-h-[44px]`).
- **depends_on**: []

### T008 — Make edit loan form responsive
- **file**: `apps/web/src/app/admin/loans/[id]/edit/page.tsx`
- **description**: (1) Change page header `flex items-center justify-between mb-6` → `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6`. (2) Change form card padding `p-6` → `p-4 sm:p-6`. (3) Change amount/term grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (4) Change frequency/rate grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (5) Change simulation panel padding `p-6` → `p-4 sm:p-6`. (6) Change simulation inner grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (7) Change button row `flex gap-4` → `flex flex-col sm:flex-row gap-2 sm:gap-4`. (8) Add `min-h-[44px]` to all buttons. (9) Add `min-h-[44px]` to all input/select fields.
- **depends_on**: []

### T009 — Make new client form responsive
- **file**: `apps/web/src/app/admin/clients/new/page.tsx`
- **description**: (1) Change form card padding `p-6` → `p-4 sm:p-6`. (2) Change ALL 5 `grid grid-cols-2 gap-4` instances to `grid grid-cols-1 sm:grid-cols-2 gap-4` (email/password, name fields, DNI/birthdate, phone/city, occupation/employer). (3) Change button row `flex gap-4 pt-4` → `flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4`. (4) Add `min-h-[44px]` to submit button. (5) Add `min-h-[44px]` to cancel button. (6) Add `min-h-[44px]` to all input fields.
- **depends_on**: []

### T010 — Make edit client form responsive
- **file**: `apps/web/src/app/admin/clients/[id]/page.tsx`
- **description**: (1) Change form card padding `p-6` → `p-4 sm:p-6`. (2) Change ALL 5 `grid grid-cols-2 gap-4` instances to `grid grid-cols-1 sm:grid-cols-2 gap-4` (email single-child grid, name fields, DNI/birthdate, phone/city, occupation/employer). (3) Change button row `flex gap-4 pt-4` → `flex flex-col sm:flex-row gap-2 sm:gap-4 pt-4`. (4) Add `min-h-[44px]` to all buttons. (5) Add `min-h-[44px]` to all input fields.
- **depends_on**: []

### T011 — Make registration form responsive
- **file**: `apps/web/src/app/register/page.tsx`
- **description**: (1) Change main padding `p-8` → `p-4 sm:p-6 md:p-8`. (2) Change H1 heading `text-3xl` → `text-2xl sm:text-3xl`. (3) Change name fields grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (4) Add `min-h-[44px]` to all input fields (`px-4 py-2` → `px-4 py-2 min-h-[44px]`). (5) Add `min-h-[44px]` to submit button (`py-3` → `py-3 min-h-[44px]`).
- **depends_on**: []

---

## Phase 3: Polish & Consistency

> **Goal**: Responsive typography, padding adjustments, settings page inline groups, landing page, simulator.

### T012 — Make landing page responsive
- **file**: `apps/web/src/app/page.tsx`
- **description**: (1) Change main padding `p-8` → `p-4 sm:p-6 md:p-8`. (2) Change H1 heading `text-5xl` → `text-3xl sm:text-4xl md:text-5xl`. (3) Change description text `text-xl` → `text-base sm:text-lg md:text-xl`. (4) Change card grid `grid md:grid-cols-3` → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. (5) Change card padding `p-6` → `p-4 sm:p-6`. (6) Change card heading `text-xl` → `text-lg sm:text-xl`. (7) Change button row `flex gap-4 justify-center` → `flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center`. (8) Add `min-h-[44px]` to buttons.
- **depends_on**: []

### T013 — Make simulator page responsive
- **file**: `apps/web/src/app/simulator/page.tsx`
- **description**: (1) Change main padding `p-8` → `p-4 sm:p-6 md:p-8`. (2) Change H1 heading `text-3xl` → `text-2xl sm:text-3xl`. (3) Change form/results grid `grid md:grid-cols-2 gap-8` → `grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8`. (4) Change form card padding `p-6` → `p-4 sm:p-6`. (5) Change results card padding `p-6` → `p-4 sm:p-6`. (6) Change form heading `text-xl` → `text-lg sm:text-xl`. (7) Change results heading `text-xl` → `text-lg sm:text-xl`. (8) Change installment display `text-3xl` → `text-2xl sm:text-3xl`. (9) Change results inner grid `grid grid-cols-2 gap-4` → `grid grid-cols-1 sm:grid-cols-2 gap-4`. (10) Add `min-h-[44px]` to calculate button. (11) Add `min-h-[44px]` to all input/select fields. (12) Change amortization card padding `p-6` → `p-4 sm:p-6`.
- **depends_on**: []

### T014 — Make settings page responsive
- **file**: `apps/web/src/app/admin/settings/page.tsx`
- **description**: (1) Change card padding `p-6` → `p-4 sm:p-6`. (2) Change rate settings grid `grid md:grid-cols-2 gap-4` → `grid grid-cols-1 md:grid-cols-2 gap-4`. (3) Change ALL inline input+button groups from `flex gap-2` to `flex flex-col sm:flex-row gap-2` (rate settings, loan limits, mora section, timezone section). (4) Change "Guardar" buttons from `px-4 py-2` to `px-4 py-2 min-h-[44px] w-full sm:w-auto`. (5) Add `min-h-[44px]` to input fields in groups. (6) Change loan limits grid `grid md:grid-cols-2 gap-4` → `grid grid-cols-1 md:grid-cols-2 gap-4`. (7) Change theme selector buttons from `flex gap-3` to `flex flex-wrap gap-2 sm:gap-3`. (8) Add `min-h-[44px]` to theme buttons.
- **depends_on**: []

### T015 — Polish login page
- **file**: `apps/web/src/app/login/page.tsx`
- **description**: (1) Change main padding `p-8` → `p-4 sm:p-6 md:p-8`. (2) Change H1 heading `text-3xl` → `text-2xl sm:text-3xl`. (3) Add `min-h-[44px]` to input fields (`px-4 py-2` → `px-4 py-2 min-h-[44px]`). (4) Add `min-h-[44px]` to submit button (`py-3` → `py-3 min-h-[44px]`).
- **depends_on**: []

### T016 — Polish admin dashboard page
- **file**: `apps/web/src/app/admin/page.tsx`
- **description**: (1) Change metric card values `text-3xl` → `text-2xl sm:text-3xl`. (2) Change distribution card values `text-2xl` → `text-xl sm:text-2xl`. (3) Change quick action card padding `p-6` → `p-4 sm:p-6`. (4) Change quick action heading `text-lg` → `text-base sm:text-lg`. (Note: grids are already responsive — no grid changes needed.)
- **depends_on**: []

---

## Phase 4: Verification & Build

> **Goal**: Ensure all changes compile, build, and pass visual verification.

### T017 — TypeScript type check
- **file**: All modified files
- **description**: Run `pnpm --filter @prestamos/web type-check` (or equivalent TypeScript check) to verify no type errors introduced by class changes.
- **depends_on**: [T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014, T015, T016]

### T018 — Build verification
- **file**: All modified files
- **description**: Run `pnpm --filter @prestamos/web build` to verify Tailwind compilation succeeds with no errors and the full Next.js build passes.
- **depends_on**: [T017]

### T019 — Visual verification checklist
- **file**: All modified files
- **description**: Manual visual verification at breakpoints 320px, 375px, 640px, 768px, 1024px, 1440px for all 15 pages. Verify: (1) No horizontal page scroll on any page at 375px. (2) All tables scroll horizontally within their container. (3) All 2-column form grids collapse to 1 column at 375px. (4) Admin nav wraps at 375px. (5) Dark mode renders correctly at each breakpoint. (6) All interactive elements meet 44px minimum touch target.
- **depends_on**: [T018]
