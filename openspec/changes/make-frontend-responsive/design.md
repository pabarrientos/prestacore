# Design: Make Entire Frontend Responsive

## Technical Approach

Pure additive Tailwind CSS class changes across 16 files — zero logic modifications, zero new dependencies. Mobile-first strategy using Tailwind's default breakpoints (`sm:640px`, `md:768px`, `lg:1024px`, `xl:1280px`). Existing dark mode styling preserved untouched.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|----------|-------------|-----------|
| **Admin nav: `flex-wrap` + `overflow-x-auto` on secondary links** | Hamburger menu, horizontal scroll only | Admin panel used by staff on tablets — wrapping keeps all actions visible without extra clicks. Secondary nav links get `overflow-x-auto` for very narrow screens. |
| **Tables: `overflow-x-auto` wrapper** | Card-based mobile layout, column hiding | Standard pattern, minimal code change, preserves desktop layout. 4 files already have it; 3 need it added. |
| **Forms: `grid-cols-1 sm:grid-cols-2`** | Single-column always, CSS `@media` queries | Two columns on tablet+ is standard for admin forms; single column on mobile prevents cramped inputs. |
| **Page headers: `flex-col sm:flex-row`** | Hidden action buttons on mobile | Keeps all actions accessible; stacks vertically on mobile, horizontal on tablet+. |
| **No new components** | Extract responsive wrapper components | Out of scope — this is CSS-only change. Component extraction deferred. |

## Responsive Patterns Applied

### Pattern 1: Page Header (title + action buttons)
**Before**: `<div className="flex justify-between items-center mb-6">`
**After**: `<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">`

### Pattern 2: Action Button Row (multiple buttons in header)
**Before**: `<div className="flex gap-2">`
**After**: `<div className="flex flex-wrap gap-2">`

### Pattern 3: Form Grid (2-column forms)
**Before**: `<div className="grid grid-cols-2 gap-4">`
**After**: `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">`

### Pattern 4: Table Container
**Before**: `<div className="bg-white rounded-lg shadow overflow-hidden">`
**After**: `<div className="bg-white rounded-lg shadow overflow-hidden"><div className="overflow-x-auto">`

### Pattern 5: Dashboard Card Grid
**Before**: `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">` (already responsive)
**After**: No change needed — already mobile-first.

### Pattern 6: Typography
**Before**: `<h1 className="text-2xl font-bold">`
**After**: `<h1 className="text-2xl md:text-3xl font-bold">` (only where oversized on mobile)

### Pattern 7: Padding on full-page layouts
**Before**: `p-8`
**After**: `p-4 md:p-6 lg:p-8`

## File Changes

| File | Action | Changes |
|------|--------|---------|
| `apps/web/src/app/admin/layout.tsx` | Modify | Nav `flex-wrap`, secondary nav `overflow-x-auto`, user info `hidden sm:inline` |
| `apps/web/src/app/admin/loans/page.tsx` | Modify | Header pattern, table `overflow-x-auto` wrapper, filter input `w-full sm:w-64` |
| `apps/web/src/app/admin/clients/page.tsx` | Modify | Header pattern, table `overflow-x-auto` wrapper, filter input `w-full sm:w-80` |
| `apps/web/src/app/admin/overdue/page.tsx` | Modify | Already has `overflow-x-auto` on table; filter form `flex-wrap` already present; summary cards `grid-cols-1 md:grid-cols-3` already responsive; distribution grid `grid-cols-2 md:grid-cols-5` already responsive |
| `apps/web/src/app/admin/loans/[id]/page.tsx` | Modify | Header `flex-col sm:flex-row`, button row `flex-wrap`, info grids `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` |
| `apps/web/src/app/page.tsx` | Modify | Padding `p-4 md:p-8`, heading `text-3xl md:text-5xl`, cards `grid-cols-1 md:grid-cols-3`, buttons `flex-col sm:flex-row` |
| `apps/web/src/app/admin/loans/new/page.tsx` | Modify | Main layout `grid-cols-1 lg:grid-cols-2` already present; inner form grid `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` |
| `apps/web/src/app/admin/loans/[id]/edit/page.tsx` | Modify | Header `flex-col sm:flex-row`, inner form grids `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` |
| `apps/web/src/app/admin/clients/new/page.tsx` | Modify | Form `max-w-2xl` → `max-w-4xl`, all 5 `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` |
| `apps/web/src/app/admin/clients/[id]/page.tsx` | Modify | Form `max-w-2xl` → `max-w-4xl`, all 5 `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` |
| `apps/web/src/app/register/page.tsx` | Modify | Padding `p-8` → `p-4 md:p-8`, grid `grid-cols-2` → `grid-cols-1 sm:grid-cols-2` |
| `apps/web/src/app/simulator/page.tsx` | Modify | Padding `p-8` → `p-4 md:p-6 lg:p-8`, heading `text-3xl md:text-4xl` |
| `apps/web/src/app/admin/settings/page.tsx` | Modify | Rate grids `md:grid-cols-2` already responsive; inline input+button groups `flex-col sm:flex-row` |
| `apps/web/src/app/admin/page.tsx` | Modify | Dashboard grid already responsive; quick actions `grid-cols-1 md:grid-cols-4` already responsive |
| `apps/web/src/app/login/page.tsx` | Modify | Padding `p-8` → `p-4 md:p-8` |

## Per-File Detailed Changes

### `admin/layout.tsx` — Admin Navigation
```
// Line 49: Main nav row
- <div className="flex justify-between h-16">
+ <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center h-auto sm:h-16 py-2 sm:py-0">

// Line 50-56: Left section (brand + user info)
- <div className="flex items-center">
+ <div className="flex flex-wrap items-center gap-2">

// Line 53-55: User info — hide on very small screens
- <span className="ml-4 text-sm text-gray-600 dark:text-white/60">
-   {user.firstName} {user.lastName} ({user.role})
- </span>
+ <span className="hidden sm:inline text-sm text-gray-600 dark:text-white/60">
+   {user.firstName} {user.lastName} ({user.role})
+ </span>

// Line 57: Right section (links + logout)
- <div className="flex items-center">
+ <div className="flex flex-wrap items-center gap-1">

// Line 75: Secondary nav
- <div className="flex space-x-4 pb-3">
+ <div className="flex space-x-4 pb-3 overflow-x-auto">
```

### `admin/loans/page.tsx` — Loans List
```
// Line 125: Page header
- <div className="flex justify-between items-center mb-6">
+ <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">

// Line 149: Table wrapper
- <div className="bg-white rounded-lg shadow overflow-hidden">
+ <div className="bg-white rounded-lg shadow overflow-hidden">
+   <div className="overflow-x-auto">
// ... table content ...
- </div>
+   </div>
+ </div>
```

### `admin/clients/page.tsx` — Clients List
```
// Line 87: Page header
- <div className="flex justify-between items-center mb-6">
+ <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">

// Line 111: Table wrapper
- <div className="bg-white rounded-lg shadow overflow-hidden">
+ <div className="bg-white rounded-lg shadow overflow-hidden">
+   <div className="overflow-x-auto">
// ... table content ...
- </div>
+   </div>
+ </div>
```

### `admin/loans/[id]/page.tsx` — Loan Detail
```
// Line 279: Page header
- <div className="flex items-center justify-between mb-6">
+ <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">

// Line 289: Button row
- <div className="flex gap-2">
+ <div className="flex flex-wrap gap-2">

// Line 432: Loan info grid
- <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

// Line 477: Client info grid
- <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
```

### `page.tsx` — Home Page
```
// Line 3: Main padding
- <main className="min-h-screen flex flex-col items-center justify-center p-8 ...">
+ <main className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 ...">

// Line 5: Heading
- <h1 className="text-5xl font-bold mb-6 ...">
+ <h1 className="text-3xl md:text-5xl font-bold mb-6 ...">

// Line 8: Subtitle
- <p className="text-xl text-gray-600 mb-8 ...">
+ <p className="text-lg md:text-xl text-gray-600 mb-8 ...">

// Line 12: Cards grid
- <div className="grid md:grid-cols-3 gap-6 mt-12">
+ <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mt-8 md:mt-12">

// Line 35: CTA buttons
- <div className="mt-12 flex gap-4 justify-center">
+ <div className="mt-8 md:mt-12 flex flex-col sm:flex-row gap-4 justify-center">
```

### `admin/loans/new/page.tsx` — New Loan Form
```
// Line 440: Inner form grid (term + frequency)
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

// Line 552: Simulation grid
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

### `admin/loans/[id]/edit/page.tsx` — Edit Loan Form
```
// Line 333: Page header
- <div className="flex items-center justify-between mb-6">
+ <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">

// Line 379, 413: Two inner form grids
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

// Line 510: Simulation grid
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

### `admin/clients/new/page.tsx` — New Client Form
```
// Line 114: Form max-width
- <form ... className="bg-white rounded-lg shadow p-6 space-y-4 max-w-2xl ...">
+ <form ... className="bg-white rounded-lg shadow p-6 space-y-4 max-w-4xl ...">

// Lines 117, 150, 180, 210, 253: All 5 grid-cols-2 instances
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

### `admin/clients/[id]/page.tsx` — Edit Client Form
```
// Line 187: Form max-width
- <form ... className="bg-white ... p-6 space-y-4 max-w-2xl">
+ <form ... className="bg-white ... p-6 space-y-4 max-w-4xl">

// Lines 190, 208, 238, 268, 311: All 5 grid-cols-2 instances
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

### `register/page.tsx` — Registration
```
// Line 55: Padding
- <main className="min-h-screen flex items-center justify-center p-8 ...">
+ <main className="min-h-screen flex items-center justify-center p-4 md:p-8 ...">

// Line 69: Name fields grid
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
```

### `simulator/page.tsx` — Loan Simulator
```
// Line 205: Main padding
- <main className="min-h-screen p-8 ...">
+ <main className="min-h-screen p-4 md:p-6 lg:p-8 ...">

// Line 207: Heading
- <h1 className="text-3xl font-bold text-center mb-8 ...">
+ <h1 className="text-2xl md:text-3xl font-bold text-center mb-6 md:mb-8 ...">
```

### `admin/settings/page.tsx` — Settings
```
// Lines 136, 156, 176, 196, 236, 256, 288, 328, 349: All inline input+button groups
- <div className="flex gap-2">
+ <div className="flex flex-col sm:flex-row gap-2">
```

## Data Flow

No data flow changes. This is purely a CSS presentation layer change.

```
User opens page on any viewport
    │
    ├── Tailwind applies responsive classes based on viewport width
    │   ├── <640px: mobile (grid-cols-1, flex-col, p-4)
    │   ├── 640px+: tablet (sm:grid-cols-2, sm:flex-row, sm:px-6)
    │   ├── 768px+: small desktop (md:text-3xl, md:grid-cols-3)
    │   └── 1024px+: desktop (lg:grid-cols-4, lg:p-8)
    │
    └── Tables with overflow-x-auto scroll horizontally if content exceeds viewport
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Visual | No horizontal overflow at 320px, 375px, 768px | Chrome DevTools device toolbar — verify `window.innerWidth` matches breakpoint |
| Visual | Desktop layout unchanged at ≥1024px | Compare before/after screenshots at 1440px |
| Visual | Tables scroll horizontally on mobile | Open loans/clients/overdue pages at 375px, verify horizontal scroll appears |
| Visual | Forms stack to single column on mobile | Open new/edit forms at 375px, verify inputs stack vertically |
| Visual | Admin nav wraps gracefully | Open admin at 375px, verify nav items wrap without overflow |
| Visual | Dark mode renders correctly | Toggle dark mode at each breakpoint |
| Build | No Tailwind compilation errors | `pnpm --filter @prestamos/web build` must succeed |

### Breakpoint Checklist

| Viewport | Device | What to verify |
|----------|--------|---------------|
| 320px | iPhone SE | No horizontal overflow, all content readable, tables scroll |
| 375px | iPhone 12/13 | Same as above, slightly more breathing room |
| 768px | iPad | Two-column grids active, nav wraps or fits |
| 1024px | Laptop | Desktop layout, 4-column dashboard grids |
| 1440px | Desktop | Identical to current state (no regression) |

## Migration / Rollout

No migration required. All changes are additive Tailwind classes — zero risk to data, API, or backend. Rollback is a single `git revert`.

## Open Questions

- None. All patterns are standard Tailwind responsive utilities with clear before/after mappings.
