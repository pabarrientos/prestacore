# Proposal: Make Entire Frontend Responsive

## Intent

The current frontend (`apps/web/`) has critical responsive design gaps that break usability on mobile and tablet devices. Tables overflow without scroll wrappers, grids don't collapse to single columns, navigation bars don't wrap, and action button rows overflow the viewport. This change makes all 16 frontend pages fully responsive using a mobile-first Tailwind strategy — no new dependencies required.

## Scope

### In Scope
- **4 critical pages** with tables that overflow on mobile (no `overflow-x-auto`)
- **6 form pages** with bare `grid-cols-2` that don't collapse on mobile
- **2 layout files** with navigation that doesn't wrap or stack
- **4 pages** with minor polish issues (padding, typography sizing, button groups)
- Standardize responsive patterns across all pages: padding, grids, tables, headers, typography
- All existing dark mode styling preserved

### Out of Scope
- Backend/API changes (none needed)
- New components or libraries (pure Tailwind class changes)
- PWA or mobile app development
- E2E test updates for responsive behavior (deferred)
- Layout redesign or UX restructuring (only responsive adaptation)

## Capabilities

### New Capabilities
- `responsive-layout`: Mobile-first responsive design system applied across all frontend pages (tables, grids, navigation, typography, spacing)

### Modified Capabilities
- None (no existing spec-level behavioral changes; purely CSS class additions)

## Approach

### Responsive Design System

Standard patterns applied consistently:

| Pattern | Mobile | Tablet+ | Desktop+ |
|---------|--------|---------|----------|
| Padding | `p-4` | `md:p-6` | `lg:p-8` |
| Grids | `grid-cols-1` | `sm:grid-cols-2` | `lg:grid-cols-3` |
| Tables | Always wrapped in `overflow-x-auto` | — | — |
| Headers | `flex-col` | `sm:flex-row sm:items-center sm:justify-between` | — |
| Headings | `text-3xl` | `md:text-4xl` | `lg:text-5xl` |

### Implementation Phases

**Phase 1: Critical Table Fixes** (4 files)
- `apps/web/src/app/admin/loans/page.tsx` — wrap table in `overflow-x-auto`
- `apps/web/src/app/admin/clients/page.tsx` — wrap table in `overflow-x-auto`
- `apps/web/src/app/admin/overdue/page.tsx` — wrap 10-column table in `overflow-x-auto`
- `apps/web/src/app/admin/loans/[id]/page.tsx` — wrap tables, fix button overflow

**Phase 2: Navigation & Layout** (2 files)
- `apps/web/src/app/admin/layout.tsx` — flex-wrap on top nav, wrap secondary nav links
- `apps/web/src/app/page.tsx` — responsive heading sizes (`text-3xl md:text-4xl lg:text-5xl`)

**Phase 3: Form Grids** (6 files)
- `apps/web/src/app/admin/loans/new/page.tsx` — `grid-cols-1 sm:grid-cols-2`
- `apps/web/src/app/admin/loans/[id]/edit/page.tsx` — `grid-cols-1 sm:grid-cols-2`
- `apps/web/src/app/admin/clients/new/page.tsx` — `grid-cols-1 sm:grid-cols-2` (5 locations)
- `apps/web/src/app/admin/clients/[id]/page.tsx` — `grid-cols-1 sm:grid-cols-2` (5 locations)
- `apps/web/src/app/register/page.tsx` — `grid-cols-1 sm:grid-cols-2`
- `apps/web/src/app/simulator/page.tsx` — responsive padding (`p-4 md:p-6 lg:p-8`)

**Phase 4: Polish & Consistency** (4 files)
- `apps/web/src/app/admin/settings/page.tsx` — inline input+button groups responsive
- `apps/web/src/app/admin/page.tsx` — dashboard cards responsive spacing
- `apps/web/src/app/login/page.tsx` — verify mobile padding consistency
- All remaining pages — audit for any missed patterns

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/src/app/admin/loans/page.tsx` | Modified | Add `overflow-x-auto` wrapper to loans table |
| `apps/web/src/app/admin/clients/page.tsx` | Modified | Add `overflow-x-auto` wrapper to clients table |
| `apps/web/src/app/admin/overdue/page.tsx` | Modified | Add `overflow-x-auto` wrapper to 10-col table |
| `apps/web/src/app/admin/loans/[id]/page.tsx` | Modified | Table wrappers + button row flex-wrap |
| `apps/web/src/app/admin/layout.tsx` | Modified | Nav flex-wrap, secondary link wrapping |
| `apps/web/src/app/page.tsx` | Modified | Responsive heading typography |
| `apps/web/src/app/admin/loans/new/page.tsx` | Modified | Responsive grid patterns |
| `apps/web/src/app/admin/loans/[id]/edit/page.tsx` | Modified | Responsive grid patterns |
| `apps/web/src/app/admin/clients/new/page.tsx` | Modified | Responsive grid patterns (5 locations) |
| `apps/web/src/app/admin/clients/[id]/page.tsx` | Modified | Responsive grid patterns (5 locations) |
| `apps/web/src/app/register/page.tsx` | Modified | Responsive grid pattern |
| `apps/web/src/app/simulator/page.tsx` | Modified | Responsive padding |
| `apps/web/src/app/admin/settings/page.tsx` | Modified | Input+button group responsiveness |
| `apps/web/src/app/admin/page.tsx` | Modified | Dashboard card spacing |
| `apps/web/src/app/login/page.tsx` | Modified | Mobile padding consistency |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Visual regression on desktop breakpoints | Low | Only adding responsive prefixes, not changing desktop classes |
| Dark mode styling conflicts with new classes | Low | Pure additive changes; `dark:` variants unaffected |
| Tables still feel cramped on small tablets | Medium | `overflow-x-auto` is standard pattern; users can scroll |
| Inconsistent application across similar pages | Medium | Use find-and-replace patterns; verify each file individually |

## Rollback Plan

1. `git revert` the entire `feat/responsive-design` branch merge
2. All changes are purely Tailwind class additions — no logic, no schema, no dependencies
3. Zero risk to data or backend functionality
4. Can selectively revert individual pages if only some cause issues

## Dependencies

- None (pure Tailwind CSS class changes, no new packages)
- Requires existing Tailwind v3.4.1 configuration (already present)

## Success Criteria

- [ ] All tables scroll horizontally on screens < 768px without breaking layout
- [ ] All 2-column grids collapse to single column on screens < 640px
- [ ] Admin navigation wraps gracefully on screens < 768px
- [ ] No horizontal page overflow on 320px viewport (iPhone SE)
- [ ] No horizontal page overflow on 375px viewport (standard mobile)
- [ ] No horizontal page overflow on 768px viewport (tablet)
- [ ] Desktop layout (≥1024px) visually identical to current state
- [ ] Dark mode renders correctly on all screen sizes
- [ ] `pnpm --filter @prestamos/web build` succeeds with no errors
