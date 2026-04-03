# Technical Design: Dark Mode — Vibe Tecnológico Verde Lima

> **Change**: `add-dark-mode`
> **Branch**: `feat/dark-mode`
> **Phase**: Design
> **Date**: 2026-04-03

---

## 1. Architecture Overview

### 1.1 Theme System Integration

The theme system integrates at three layers of the Next.js app:

```
┌─────────────────────────────────────────────────┐
│  <html> (root layout)                           │
│    └─ className="dark" ← toggled by next-themes │
│       └─ <body>                                 │
│          └─ <Providers>                         │
│             ├─ <ThemeProvider>  ← next-themes   │
│             └─ <AuthProvider>   ← existing      │
│                └─ App pages                     │
└─────────────────────────────────────────────────┘
```

**Data flow for theme state**:

1. `next-themes` `ThemeProvider` reads `localStorage` → `prefers-color-scheme` → defaults to `'light'`
2. On mount, it writes `class="dark"` or removes it from `<html>`
3. Tailwind's `darkMode: 'class'` picks up the class and applies `dark:` variants
4. Theme changes persist in `localStorage` automatically
5. System preference is respected on first visit via `enableSystem: true`

### 1.2 Component Hierarchy

```
apps/web/src/
├── app/
│   ├── layout.tsx          ← <html> with ThemeProvider on <body>
│   ├── globals.css         ← CSS custom properties for both themes
│   └── ...
├── components/
│   ├── providers.tsx       ← wraps ThemeProvider + AuthProvider
│   ├── ThemeToggle.tsx     ← NEW: sun/moon icon toggle button
│   └── ...existing modals/forms
└── lib/
    └── theme.ts            ← NEW: theme type + constants (optional helper)
```

### 1.3 SSR Safety

`next-themes` handles SSR automatically:
- `suppressHydrationWarning` on `<html>` prevents hydration mismatch
- The theme script runs before paint, preventing FOUC
- `attribute="class"` ensures the class is set on `<html>` not `<body>`

---

## 2. File Structure After Implementation

```
apps/web/
├── package.json                    # MODIFIED: add next-themes dependency
├── tailwind.config.js              # MODIFIED: add darkMode: 'class'
├── src/
│   ├── app/
│   │   ├── layout.tsx              # MODIFIED: suppressHydrationWarning on <html>
│   │   ├── globals.css             # MODIFIED: CSS custom properties for light/dark
│   │   ├── page.tsx                # MODIFIED: dark: variants
│   │   ├── login/page.tsx          # MODIFIED: dark: variants
│   │   ├── register/page.tsx       # MODIFIED: dark: variants
│   │   ├── simulator/page.tsx      # MODIFIED: dark: variants
│   │   └── admin/
│   │       ├── layout.tsx          # MODIFIED: dark: nav, ThemeToggle
│   │       ├── page.tsx            # MODIFIED: dark: dashboard cards
│   │       ├── settings/page.tsx   # MODIFIED: dark: forms + theme selector
│   │       ├── loans/
│   │       │   ├── page.tsx        # MODIFIED: dark: table
│   │       │   ├── new/page.tsx    # MODIFIED: dark: form
│   │       │   └── [id]/
│   │       │       ├── page.tsx    # MODIFIED: dark: detail view
│   │       │       └── edit/page.tsx # MODIFIED: dark: edit form
│   │       ├── clients/
│   │       │   ├── page.tsx        # MODIFIED: dark: table
│   │       │   ├── new/page.tsx    # MODIFIED: dark: form
│   │       │   └── [id]/page.tsx   # MODIFIED: dark: edit form
│   │       └── overdue/page.tsx    # MODIFIED: dark: table + cards
│   ├── components/
│   │   ├── providers.tsx           # MODIFIED: add ThemeProvider
│   │   ├── ThemeToggle.tsx         # NEW: toggle component
│   │   ├── PaymentForm.tsx         # MODIFIED: dark: form + alerts
│   │   ├── RefinancingModal.tsx    # MODIFIED: dark: modal + orange/green sections
│   │   └── CancelacionAnticipadaModal.tsx # MODIFIED: dark: modal + green sections
│   └── lib/
│       ├── auth-context.tsx        # NO CHANGES
│       ├── datetime.ts             # NO CHANGES
│       └── theme.ts                # NEW: constants + type definitions
```

**Total**: 25 files modified, 2 new files, 2 unchanged.

---

## 3. Technical Decisions

### Decision 1: Theme Provider — `next-themes`

**Choice**: `next-themes` v0.3.x

**Why over alternatives**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| `next-themes` | SSR-safe, zero FOUC, system pref, localStorage, tiny (1.2kb) | External dependency | ✅ **Chosen** |
| Manual `useState` + `useEffect` | No dependency | FOUC guaranteed, SSR mismatch, reinvents wheel | ❌ |
| `use-dark-mode` | Simple API | No Next.js SSR support, larger bundle | ❌ |
| Context + localStorage | Full control | Must handle SSR, FOUC, system pref manually | ❌ |

**Configuration**:

```tsx
// In providers.tsx
import { ThemeProvider } from 'next-themes';

<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  disableTransitionOnChange
>
  <AuthProvider>{children}</AuthProvider>
</ThemeProvider>
```

**Rationale for options**:
- `attribute="class"`: Required for Tailwind's `darkMode: 'class'` strategy
- `defaultTheme="system"`: Respects OS preference on first visit
- `enableSystem`: Allows `'system'` as a valid theme value
- `disableTransitionOnChange`: Prevents jarring CSS transitions during theme switch

### Decision 2: Tailwind Dark Mode — `darkMode: 'class'`

**Choice**: `darkMode: 'class'` in `tailwind.config.js`

**Why over `'media'`**:

| Strategy | Behavior | User Control | Our Need |
|----------|----------|-------------|----------|
| `'media'` | Follows `prefers-color-scheme` only | None — user can't override | ❌ Can't have toggle |
| `'class'` | Toggled by presence of `.dark` class on `<html>` | Full — we control the class | ✅ Required for toggle |
| `'selector'` (v4 only) | Custom selector | Full | ❌ We're on Tailwind v3.4.1 |

**Interaction with existing `primary` color config**:

The current `primary` palette (sky blue) is defined in `tailwind.config.js`. In dark mode, these colors remain available via `dark:bg-primary-600`, etc. The primary color is **kept as-is** because:
1. Sky blue (`#0ea5e9`) has sufficient contrast on dark surfaces
2. It's used for brand identity (logo, headings)
3. The neon green accent (`#39ff14`) is reserved for interactive elements, not replacing primary

### Decision 3: CSS Architecture — CSS Custom Properties + Tailwind `dark:`

**Approach**: Hybrid — CSS custom properties for semantic tokens, Tailwind `dark:` for component-level overrides.

**Why not pure CSS variables**: The codebase has 17 files with scattered hardcoded Tailwind utility classes. A pure CSS variable approach would require refactoring every `bg-white` → `var(--bg-primary)`, which is more invasive and loses Tailwind's utility benefits.

**Why not pure Tailwind `dark:`**: Some patterns (like the neon glow effect) need custom CSS that Tailwind utilities can't express cleanly.

**Strategy**:

```css
/* globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Base surfaces */
  --bg-primary: #ffffff;
  --bg-secondary: #f9fafb;
  --bg-card: #ffffff;
  --bg-input: #ffffff;

  /* Text */
  --text-primary: #111827;
  --text-secondary: #4b5563;
  --text-muted: #9ca3af;

  /* Borders */
  --border-default: #d1d5db;

  /* Accent (same in both modes) */
  --neon-accent: #39ff14;
}

.dark {
  /* Base surfaces — Material Design dark palette */
  --bg-primary: #121212;
  --bg-secondary: #1a1a1a;
  --bg-card: #1e1e1e;
  --bg-input: #2a2a2a;

  /* Text — WCAG AA compliant on #121212 */
  --text-primary: rgba(255, 255, 255, 0.87);
  --text-secondary: rgba(255, 255, 255, 0.60);
  --text-muted: rgba(255, 255, 255, 0.38);

  /* Borders */
  --border-default: #333333;
}

/* Neon glow utility — only visible in dark mode */
.dark .neon-glow {
  box-shadow: 0 0 15px rgba(57, 255, 20, 0.4);
}

.dark .neon-glow-strong {
  box-shadow: 0 0 20px rgba(57, 255, 20, 0.6), 0 0 40px rgba(57, 255, 20, 0.2);
}

/* Neon border utility */
.dark .neon-border {
  border-color: #39ff14;
}

/* Neon text utility */
.dark .neon-text {
  color: #39ff14;
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.3);
}
```

**Neon glow effect**: Implemented as CSS classes (`.neon-glow`, `.neon-glow-strong`) rather than Tailwind utilities because:
1. `box-shadow` with multiple layers is verbose in Tailwind
2. These are decorative effects used in specific places (CTAs, active nav)
3. Only needed in dark mode — CSS `.dark` selector handles this cleanly

**Primary color strategy**: The sky blue `primary` palette **stays unchanged**. The neon green (`#39ff14`) is a **separate accent** used only for:
- Primary CTA buttons in dark mode (replaces `bg-primary-600`)
- Active navigation border (replaces `border-primary-600`)
- Focus rings on inputs in dark mode
- Glow shadows on key interactive elements

It does NOT replace the `primary` Tailwind config. The `primary` palette remains for light mode and for non-CTA elements in dark mode.

### Decision 4: Semantic Color Mapping

This is the **most complex** part because the codebase uses semantic colors heavily in status badges, alerts, and modals.

#### 4.1 Status Badges Pattern

Current pattern (light mode):
```tsx
<span className="bg-green-100 text-green-800">Activo</span>
<span className="bg-yellow-100 text-yellow-800">Pendiente</span>
<span className="bg-red-100 text-red-800">Vencido</span>
<span className="bg-blue-100 text-blue-800">Info</span>
```

Dark mode mapping:
```tsx
<span className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Activo</span>
<span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-400">Pendiente</span>
<span className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400">Vencido</span>
<span className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400">Info</span>
```

**Rationale**: The `dark:bg-X-900/50` pattern provides a tinted background that's visible but not overwhelming on dark surfaces. The `dark:text-X-400` provides sufficient contrast (WCAG AA) on the dark tinted background.

#### 4.2 Alert Boxes Pattern

Current (error alert):
```tsx
<div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg">
```

Dark mode:
```tsx
<div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg
              dark:bg-red-950/50 dark:border-red-900 dark:text-red-400">
```

Current (success alert):
```tsx
<div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg">
```

Dark mode:
```tsx
<div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg
              dark:bg-green-950/50 dark:border-green-900 dark:text-green-400">
```

Current (info alert):
```tsx
<div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
  <p className="text-blue-700">...</p>
</div>
```

Dark mode:
```tsx
<div className="bg-blue-50 border border-blue-200 rounded-lg p-3
              dark:bg-blue-950/50 dark:border-blue-900">
  <p className="text-blue-700 dark:text-blue-400">...</p>
</div>
```

#### 4.3 CancelacionAnticipadaModal — Heavy Green Usage

This modal is **heavily green-themed** (`bg-green-50`, `text-green-800`, `bg-green-600`, etc.). The dark mode conversion:

| Light Class | Dark Equivalent | Notes |
|------------|----------------|-------|
| `bg-green-50` | `dark:bg-green-950/50` | Tinted background |
| `border-green-200` | `dark:border-green-900` | Subtle border |
| `text-green-800` | `dark:text-green-400` | Readable text |
| `text-green-700` | `dark:text-green-400` | Same |
| `text-green-900` | `dark:text-green-300` | Slightly brighter for emphasis |
| `text-green-600` | `dark:text-green-500` | Muted text |
| `bg-green-600` (total box) | `dark:bg-green-700` | Keep solid but darker shade |
| `border-green-300` (input) | `dark:border-green-700` | Input border |
| `focus:ring-green-500` | `dark:focus:ring-green-600` | Focus ring |

The green semantic meaning (this is a "cancelación" = positive financial action) is **preserved** — we don't switch to a different color, we just adjust the shades for dark mode readability.

#### 4.4 RefinancingModal — Heavy Orange Usage

Similar pattern to CancelacionAnticipadaModal but with orange:

| Light Class | Dark Equivalent |
|------------|----------------|
| `bg-orange-50` | `dark:bg-orange-950/50` |
| `border-orange-200` | `dark:border-orange-900` |
| `text-orange-800` | `dark:text-orange-400` |
| `text-orange-700` | `dark:text-orange-400` |
| `text-orange-900` | `dark:text-orange-300` |
| `text-orange-600` | `dark:text-orange-500` |
| `border-orange-300` | `dark:border-orange-700` |
| `focus:ring-orange-500` | `dark:focus:ring-orange-600` |

The orange semantic meaning (refinancing = caution/restructuring) is preserved.

#### 4.5 Table Rows

Current:
```tsx
<tbody className="divide-y divide-green-200 bg-white">
<tr className="border-t">
<thead className="bg-gray-50">
```

Dark mode:
```tsx
<tbody className="divide-y divide-green-200 bg-white dark:divide-green-900 dark:bg-[#1e1e1e]">
<tr className="border-t dark:border-gray-800">
<thead className="bg-gray-50 dark:bg-[#1a1a1a]">
```

#### 4.6 Complete Semantic Color Mapping Table

| Semantic | Light Mode | Dark Mode | Used In |
|----------|-----------|-----------|---------|
| Success | `green-50/200/600/800` | `green-950/50`, `green-900`, `green-400`, `green-300` | CancelacionModal, PaymentForm, alerts |
| Error | `red-50/200/600` | `red-950/50`, `red-900`, `red-400` | All error alerts |
| Warning | `yellow-100/600/800` | `yellow-900/50`, `yellow-400` | Status badges |
| Info | `blue-50/200/700` | `blue-950/50`, `blue-900`, `blue-400` | Info boxes, RefinancingModal buttons |
| Refinance | `orange-50/200/600/700/800/900` | `orange-950/50`, `orange-900`, `orange-400`, `orange-300` | RefinancingModal |
| Neutral bg | `white`, `gray-50` | `#121212`, `#1a1a1a`, `#1e1e1e` | Cards, surfaces |
| Neutral text | `gray-900/700/600/500` | `white/87`, `white/60`, `white/38`, `#d3d3d3` | All text |
| Neutral border | `gray-200/300` | `gray-700`, `#333333` | Inputs, dividers |

### Decision 5: Neon Accent Strategy

**Color**: `#39ff14` (neon green / chartreuse)

#### Where TO use it:

| Element | Implementation | Example |
|---------|---------------|---------|
| Primary CTA buttons (dark only) | `dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]` | "Calcular", "Registrar Pago", "Iniciar Sesión" |
| Active nav border | `dark:text-[#39ff14] dark:border-[#39ff14]` | Current page in admin nav |
| Focus rings (dark only) | `dark:focus:ring-[#39ff14]` | Input focus |
| Glow on CTA hover (dark only) | `dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]` | Button hover state |
| Brand heading accent (dark only) | `dark:text-[#39ff14]` | "Préstamos Admin" in nav |
| Theme toggle icon (dark mode) | `text-[#39ff14]` | Moon icon when dark |

#### Where NOT to use it:

| Element | Reason | Alternative |
|---------|--------|-------------|
| Body text | Fails WCAG contrast, causes eye strain | `rgba(255,255,255,0.87)` |
| Large backgrounds | Overwhelming, reduces readability | `#121212`, `#1e1e1e` |
| Status badges | Loses semantic meaning | Keep green/red/yellow/blue |
| Error messages | Confusing — green = success | Keep red |
| Table data cells | Reduces scanability | Keep semantic colors |
| Modal backdrops | Already dark, no need | `bg-black/50` stays |

#### CSS Box-Shadow Values for Glow

```css
/* Subtle glow — for active nav items, links */
.dark .neon-glow {
  box-shadow: 0 0 15px rgba(57, 255, 20, 0.4);
}

/* Strong glow — for primary CTA buttons */
.dark .neon-glow-strong {
  box-shadow:
    0 0 20px rgba(57, 255, 20, 0.6),
    0 0 40px rgba(57, 255, 20, 0.2);
}

/* Text glow — for headings only */
.dark .neon-text-glow {
  text-shadow: 0 0 8px rgba(57, 255, 20, 0.3);
}
```

---

## 4. Implementation Pattern

### 4.1 Per-Element Conversion Pattern

The standard pattern for converting any element:

```tsx
// BEFORE (light only)
<div className="bg-white rounded-lg shadow p-6">

// AFTER (dual theme)
<div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
```

```tsx
// BEFORE
<p className="text-gray-600">Some text</p>

// AFTER
<p className="text-gray-600 dark:text-white/60">Some text</p>
```

```tsx
// BEFORE
<input className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500" />

// AFTER
<input className="w-full px-4 py-2 border rounded-lg
                  dark:bg-[#2a2a2a] dark:border-gray-700 dark:text-white/87
                  focus:ring-2 focus:ring-primary-500 dark:focus:ring-[#39ff14]" />
```

### 4.2 Button Conversion Pattern

```tsx
// BEFORE — primary button
<button className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700">

// AFTER — primary button with neon accent in dark mode
<button className="px-6 py-3 bg-primary-600 text-white rounded-lg
                   hover:bg-primary-700 transition
                   dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]
                   dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]">
```

```tsx
// BEFORE — secondary/outline button
<button className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50">

// AFTER
<button className="px-6 py-3 border border-primary-600 text-primary-600 rounded-lg
                   hover:bg-primary-50 transition
                   dark:border-[#39ff14] dark:text-[#39ff14] dark:hover:bg-[#39ff14]/10">
```

### 4.3 Card/Surface Conversion Pattern

```tsx
// BEFORE
<div className="bg-white rounded-lg shadow p-6">

// AFTER
<div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6">
```

```tsx
// BEFORE — subtle surface
<div className="bg-gray-50 rounded-lg">

// AFTER
<div className="bg-gray-50 dark:bg-[#1a1a1a] rounded-lg">
```

### 4.4 Table Conversion Pattern

```tsx
// BEFORE
<table className="min-w-full divide-y divide-gray-200">
  <thead className="bg-gray-50">
    <th className="text-gray-600">Header</th>
  </thead>
  <tbody className="divide-y divide-gray-200 bg-white">
    <tr className="border-t">
      <td className="text-gray-900">Data</td>
    </tr>
  </tbody>
</table>

// AFTER
<table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
  <thead className="bg-gray-50 dark:bg-[#1a1a1a]">
    <th className="text-gray-600 dark:text-white/60">Header</th>
  </thead>
  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-[#1e1e1e]">
    <tr className="border-t dark:border-gray-800">
      <td className="text-gray-900 dark:text-white/87">Data</td>
    </tr>
  </tbody>
</table>
```

### 4.5 Modal Overlay Pattern

```tsx
// Modal backdrop — already works in dark mode
<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
  <div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow-lg">
    {/* Modal content */}
  </div>
</div>
```

The `bg-black bg-opacity-50` backdrop works correctly in both modes — no change needed.

### 4.6 Loading Spinner Pattern

```tsx
// BEFORE
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>

// AFTER
<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 dark:border-[#39ff14]"></div>
```

---

## 5. Migration Strategy

### 5.1 Order of File Modifications

**Phase 1: Infrastructure** (foundation — must be first)
1. `apps/web/package.json` — add `next-themes`
2. `apps/web/tailwind.config.js` — add `darkMode: 'class'`
3. `apps/web/src/app/globals.css` — CSS custom properties + neon utilities

**Phase 2: Provider + Toggle** (enables theme switching)
4. `apps/web/src/components/providers.tsx` — wrap with ThemeProvider
5. `apps/web/src/components/ThemeToggle.tsx` — NEW toggle component
6. `apps/web/src/lib/theme.ts` — NEW constants/types

**Phase 3: Root Layout** (applies theme to html)
7. `apps/web/src/app/layout.tsx` — `suppressHydrationWarning` on `<html>`

**Phase 4: Admin Layout + Settings** (visible navigation + theme control)
8. `apps/web/src/app/admin/layout.tsx` — dark nav, integrate ThemeToggle
9. `apps/web/src/app/admin/settings/page.tsx` — add theme selector

**Phase 5: Auth Pages** (public-facing, simple)
10. `apps/web/src/app/page.tsx` — home page
11. `apps/web/src/app/login/page.tsx` — login form
12. `apps/web/src/app/register/page.tsx` — register form

**Phase 6: Admin Pages** (dashboard + CRUD)
13. `apps/web/src/app/admin/page.tsx` — dashboard
14. `apps/web/src/app/admin/loans/page.tsx` — loans list
15. `apps/web/src/app/admin/loans/new/page.tsx` — new loan form
16. `apps/web/src/app/admin/loans/[id]/page.tsx` — loan detail
17. `apps/web/src/app/admin/loans/[id]/edit/page.tsx` — edit loan
18. `apps/web/src/app/admin/clients/page.tsx` — clients list
19. `apps/web/src/app/admin/clients/new/page.tsx` — new client
20. `apps/web/src/app/admin/clients/[id]/page.tsx` — edit client
21. `apps/web/src/app/admin/overdue/page.tsx` — overdue management

**Phase 7: Shared Components** (complex modals + forms)
22. `apps/web/src/app/simulator/page.tsx` — simulator
23. `apps/web/src/components/PaymentForm.tsx` — payment form
24. `apps/web/src/components/RefinancingModal.tsx` — refinancing modal
25. `apps/web/src/components/CancelacionAnticipadaModal.tsx` — cancelación modal

### 5.2 Incremental Testing

After each phase:
1. Run `pnpm --filter @prestamos/web dev`
2. Toggle theme via ThemeToggle
3. Verify no visual regressions in light mode
4. Verify dark mode renders correctly
5. Check browser console for hydration warnings

### 5.3 Rollback Plan

Since this is purely frontend CSS/class changes:

**Full rollback**:
```bash
git revert HEAD~N  # revert all dark mode commits
```

**Partial rollback** (if only some files are problematic):
```bash
git checkout HEAD -- apps/web/src/components/RefinancingModal.tsx
```

**Emergency rollback** (remove dark mode entirely):
1. Remove `next-themes` from `package.json`
2. Revert `tailwind.config.js` (remove `darkMode: 'class'`)
3. Delete `ThemeToggle.tsx`
4. Strip all `dark:` prefixes: `rg 'dark:' -l apps/web/src | xargs sed -i 's/ dark:[^ ]*//g'`
5. Revert `globals.css` to original

No database changes to roll back — zero backend impact.

---

## 6. Testing Approach

### 6.1 Visual Verification Checklist

For each page in dark mode:
- [ ] Background surfaces render as `#121212` / `#1e1e1e` (not pure black)
- [ ] Text is readable (no `gray-900` on dark backgrounds)
- [ ] Input fields have visible borders and readable text
- [ ] Buttons have neon green accent with glow on hover
- [ ] Status badges use dark-tinted backgrounds (`green-900/50`, etc.)
- [ ] Alert boxes are visible with proper contrast
- [ ] Tables have alternating row visibility
- [ ] Modal overlays render correctly (backdrop + content)
- [ ] Loading spinners are visible (neon green border)
- [ ] Navigation active state uses neon green border

### 6.2 Automated Tests

**Unit test for ThemeToggle** (new file: `ThemeToggle.test.tsx`):
```tsx
import { render, screen } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

describe('ThemeToggle', () => {
  it('renders toggle button', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

**No changes to existing tests** — the `dark:` variants are additive and don't change component behavior.

### 6.3 Cross-Browser Considerations

| Browser | Concern | Mitigation |
|---------|---------|------------|
| Chrome 90+ | Full support | ✅ No issues |
| Firefox 88+ | Full support | ✅ No issues |
| Safari 15.4+ | Full support | ✅ No issues |
| Safari < 15.4 | `dark:` variants may not work | Graceful degradation — shows light mode |
| Edge 90+ | Full support | ✅ No issues |

**Key considerations**:
1. `prefers-color-scheme` is supported in all modern browsers (2020+)
2. CSS custom properties are universally supported
3. The `dark:` prefix is a Tailwind compile-time feature — no runtime JS needed for the CSS
4. `next-themes` uses a minimal inline script that runs before paint — works in all browsers that support Next.js

### 6.4 Accessibility

- **WCAG AA compliance**: All text combinations meet 4.5:1 contrast ratio
  - `rgba(255,255,255,0.87)` on `#121212` = 15.4:1 ✅
  - `rgba(255,255,255,0.60)` on `#121212` = 7.5:1 ✅
  - `#39ff14` on `#121212` = 11.8:1 ✅ (for large text/UI components only)
- **Neon green is NOT used for body text** — only for large interactive elements
- **Focus indicators**: Neon green focus rings are highly visible
- **Reduced motion**: `disableTransitionOnChange` prevents jarring theme transitions

---

## 7. ThemeToggle Component Spec

```tsx
// apps/web/src/components/ThemeToggle.tsx
'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />; // placeholder

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition"
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {resolvedTheme === 'dark' ? (
        // Sun icon for dark mode (click to go light)
        <svg className="w-5 h-5 text-[#39ff14]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        // Moon icon for light mode (click to go dark)
        <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}
```

**Placement**: In the admin nav bar, between "Inicio" link and "Cerrar sesión" button.

---

## 8. Settings Page Theme Selector

Add a new section to `apps/web/src/app/admin/settings/page.tsx`:

```tsx
{/* Apariencia */}
<div className="bg-white dark:bg-[#1e1e1e] rounded-lg shadow p-6 mb-6">
  <h2 className="text-lg font-semibold mb-4 dark:text-white/87">Apariencia</h2>
  <p className="text-sm text-gray-500 dark:text-white/60 mb-4">
    Selecciona el tema de la interfaz
  </p>

  <div className="flex gap-3">
    {(['light', 'dark', 'system'] as const).map((t) => (
      <button
        key={t}
        onClick={() => setTheme(t)}
        className={`px-4 py-2 rounded-lg border transition ${
          theme === t
            ? 'border-[#39ff14] bg-[#39ff14]/10 text-[#39ff14] dark:border-[#39ff14] dark:bg-[#39ff14]/10 dark:text-[#39ff14]'
            : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5'
        }`}
      >
        {t === 'light' ? '☀️ Claro' : t === 'dark' ? '🌙 Oscuro' : '💻 Sistema'}
      </button>
    ))}
  </div>
</div>
```

---

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FOUC on first load | Low | Medium | `next-themes` inline script prevents this |
| Hydration mismatch | Low | Medium | `suppressHydrationWarning` on `<html>`, mounted check in ThemeToggle |
| Semantic colors unreadable in dark | Medium | High | Use tested `dark:bg-X-900/50 dark:text-X-400` pattern |
| Neon green fails contrast on some elements | Low | Medium | Only use on large interactive elements, never body text |
| Modal overlays look wrong | Low | Low | Already dark — verify visually |
| Maintenance burden of dual-theme classes | High | Medium | Document pattern, use consistent `dark:` prefix convention |
| Tailwind build warnings about missing variants | Low | Low | Run `pnpm build` after each phase |

---

## 10. Success Criteria (from proposal, with technical validation)

| Criterion | How to Verify |
|-----------|--------------|
| Theme toggle in admin nav, persists | Toggle → reload page → check localStorage + visual |
| System preference respected on first visit | Set OS to dark → clear localStorage → load page |
| No FOUC | Load page with dark OS pref → should render dark immediately |
| All 17 pages/components render correctly | Manual checklist per page |
| Neon accent on CTAs, active nav, focus rings | Visual inspection in dark mode |
| Status badges, alerts, tables readable | Visual inspection with contrast checker |
| Modal overlays correct | Open each modal in dark mode |
| Settings page theme selector | Click each option → verify theme changes |
| `pnpm build` succeeds | Run build, check for Tailwind warnings |
