# Proposal: Dark Mode — Vibe Tecnológico Verde Lima

## Intent

Add a complete dark mode theme to the Next.js frontend (`apps/web/`) with a neon green accent (#39ff14) on dark surfaces (#121212), giving users a modern "tech vibe" aesthetic while reducing eye strain. Zero backend changes required.

## Scope

### In Scope
- `next-themes` integration (SSR-safe, no flash, localStorage persistence)
- Tailwind `darkMode: 'class'` configuration
- CSS custom properties in `globals.css` for dark palette
- `ThemeToggle` component in admin nav bar
- `dark:` variants on **all 17 frontend files** (pages + components)
- Neon green accent (#39ff14) for CTAs, active states, glow shadows
- Semantic color adaptation (status badges, error/success messages, tables)
- Settings page theme selector (light/dark/system)

### Out of Scope
- Backend/API changes (none needed)
- Mobile app or PWA theming
- Custom animations beyond CSS glow shadows
- Per-user theme persistence on server (localStorage only)
- E2E test updates for dark mode (deferred)

## Capabilities

### New Capabilities
- `theme-management`: Theme switching infrastructure (next-themes, toggle component, CSS variables, Tailwind darkMode config)
- `dark-mode-ui`: Dark mode visual styling across all pages, components, and modals

### Modified Capabilities
- None (no existing spec-level behavioral changes)

## Approach

### Color System Design

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#121212` |
| `--bg-secondary` | `#f9fafb` (gray-50) | `#1a1a1a` |
| `--bg-card` | `#ffffff` | `#1e1e1e` |
| `--bg-input` | `#ffffff` | `#2a2a2a` |
| `--text-primary` | `#111827` (gray-900) | `rgba(255,255,255,0.87)` |
| `--text-secondary` | `#4b5563` (gray-600) | `rgba(255,255,255,0.60)` |
| `--text-muted` | `#9ca3af` (gray-400) | `rgba(255,255,255,0.38)` |
| `--border` | `#d1d5db` (gray-300) | `#333333` |
| `--accent-neon` | `#39ff14` | `#39ff14` (same) |
| `--accent-secondary` | `#0ea5e9` (primary-500) | `#d3d3d3` |

**Neon accent strategy**: #39ff14 used ONLY for primary CTAs, active nav borders, focus rings, and glow box-shadows. Never for body text or large surfaces.

**Semantic color dark mapping**:
- Status badges (`green-100/green-800` → `green-900/50` bg + `green-400` text)
- Error alerts (`red-50/red-200/red-600` → `red-950/50` bg + `red-400` text + `red-900` border)
- Success alerts (`green-50/green-200/green-600` → `green-950/50` bg + `green-400` text)
- Info alerts (`blue-50/blue-200/blue-700` → `blue-950/50` bg + `blue-400` text)
- Table rows (`bg-gray-50` → `bg-white/5`, `divide-gray-200` → `divide-gray-800`)

**Neon glow utility**: `box-shadow: 0 0 15px rgba(57, 255, 20, 0.4)`

### Implementation Phases

**Phase 1: Infrastructure** (3 files)
- `apps/web/package.json` — add `next-themes` dependency
- `apps/web/tailwind.config.js` — add `darkMode: 'class'`
- `apps/web/src/app/globals.css` — CSS custom properties for both themes

**Phase 2: Theme Provider + Toggle** (2 files)
- `apps/web/src/components/providers.tsx` — wrap with `ThemeProvider`
- `apps/web/src/components/ThemeToggle.tsx` — NEW: sun/moon icon toggle

**Phase 3: Layouts** (3 files)
- `apps/web/src/app/layout.tsx` — add `className="dark"` to `<html>` via ThemeProvider
- `apps/web/src/app/admin/layout.tsx` — dark nav, secondary nav, integrate ThemeToggle
- `apps/web/src/app/admin/settings/page.tsx` — add theme selector control

**Phase 4: Auth Pages** (3 files)
- `apps/web/src/app/page.tsx` — home page cards, CTAs
- `apps/web/src/app/login/page.tsx` — form, error alerts
- `apps/web/src/app/register/page.tsx` — form, error alerts

**Phase 5: Admin Pages** (7 files)
- `apps/web/src/app/admin/page.tsx` — dashboard cards, quick actions
- `apps/web/src/app/admin/loans/page.tsx` — table, status badges, filters
- `apps/web/src/app/admin/loans/new/page.tsx` — form, preview table
- `apps/web/src/app/admin/loans/[id]/page.tsx` — detail cards, tables, modals overlay
- `apps/web/src/app/admin/loans/[id]/edit/page.tsx` — edit form
- `apps/web/src/app/admin/clients/page.tsx` — client table
- `apps/web/src/app/admin/clients/new/page.tsx` — new client form
- `apps/web/src/app/admin/clients/[id]/page.tsx` — edit client form
- `apps/web/src/app/admin/overdue/page.tsx` — overdue table, summary cards, filters

**Phase 6: Shared Components** (4 files)
- `apps/web/src/app/simulator/page.tsx` — simulator form, results, amortization table
- `apps/web/src/components/PaymentForm.tsx` — payment form, alerts
- `apps/web/src/components/RefinancingModal.tsx` — modal, debt breakdown, preview table
- `apps/web/src/components/CancelacionAnticipadaModal.tsx` — modal, green-themed breakdown

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/web/package.json` | Modified | Add `next-themes` dependency |
| `apps/web/tailwind.config.js` | Modified | Add `darkMode: 'class'` |
| `apps/web/src/app/globals.css` | Modified | CSS custom properties for light/dark themes |
| `apps/web/src/components/providers.tsx` | Modified | Add ThemeProvider wrapper |
| `apps/web/src/components/ThemeToggle.tsx` | New | Toggle button component |
| `apps/web/src/app/layout.tsx` | Modified | ThemeProvider on html element |
| `apps/web/src/app/admin/layout.tsx` | Modified | Dark nav, ThemeToggle integration |
| `apps/web/src/app/admin/settings/page.tsx` | Modified | Theme selector control |
| `apps/web/src/app/page.tsx` | Modified | Home page dark variants |
| `apps/web/src/app/login/page.tsx` | Modified | Login form dark variants |
| `apps/web/src/app/register/page.tsx` | Modified | Register form dark variants |
| `apps/web/src/app/admin/page.tsx` | Modified | Dashboard cards dark variants |
| `apps/web/src/app/admin/loans/page.tsx` | Modified | Loans table dark variants |
| `apps/web/src/app/admin/loans/new/page.tsx` | Modified | New loan form dark variants |
| `apps/web/src/app/admin/loans/[id]/page.tsx` | Modified | Loan detail dark variants |
| `apps/web/src/app/admin/loans/[id]/edit/page.tsx` | Modified | Edit loan form dark variants |
| `apps/web/src/app/admin/clients/page.tsx` | Modified | Clients table dark variants |
| `apps/web/src/app/admin/clients/new/page.tsx` | Modified | New client form dark variants |
| `apps/web/src/app/admin/clients/[id]/page.tsx` | Modified | Edit client form dark variants |
| `apps/web/src/app/admin/overdue/page.tsx` | Modified | Overdue page dark variants |
| `apps/web/src/app/simulator/page.tsx` | Modified | Simulator dark variants |
| `apps/web/src/components/PaymentForm.tsx` | Modified | Payment form dark variants |
| `apps/web/src/components/RefinancingModal.tsx` | Modified | Refinancing modal dark variants |
| `apps/web/src/components/CancelacionAnticipadaModal.tsx` | Modified | Cancelación modal dark variants |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flash of unstyled content (FOUC) on first load | Medium | `next-themes` handles this via `suppressHydrationWarning` + SSR attribute |
| Semantic colors lose meaning in dark mode (e.g., green-800 on dark bg) | High | Use Tailwind's dark: prefix with adjusted opacity/background combos |
| Neon green (#39ff14) fails WCAG contrast on dark surfaces | Medium | Use only on large interactive elements (buttons, borders), never body text |
| Modal overlays (`bg-black bg-opacity-50`) look wrong on dark | Low | Already dark overlay — verify visually, adjust opacity if needed |
| Maintenance burden of dual-theme className proliferation | High | Use consistent patterns: `dark:bg-X dark:text-Y` on every element; document convention |

## Rollback Plan

1. `git revert` the entire `feat/dark-mode` branch merge
2. Or selectively: remove `next-themes` from package.json, revert `tailwind.config.js`, remove `ThemeToggle.tsx`, strip all `dark:` prefixes via search-and-replace
3. No database changes to roll back — purely frontend CSS/class changes

## Dependencies

- `next-themes` ^0.3.x (peer dep: Next.js 13+, React 18+ — both satisfied)
- No other new dependencies

## Success Criteria

- [ ] Theme toggle visible in admin nav bar, persists across page reloads
- [ ] System preference (`prefers-color-scheme`) respected on first visit
- [ ] No FOUC on initial page load (light or dark)
- [ ] All 17 pages/components render correctly in dark mode with no hardcoded light-only colors visible
- [ ] Neon accent (#39ff14) appears on CTAs, active nav, focus rings with glow effect
- [ ] Status badges, error/success alerts, table rows all readable in dark mode
- [ ] Modal overlays and backdrop render correctly in dark mode
- [ ] Settings page allows explicit light/dark/system selection
- [ ] `pnpm build` succeeds with no Tailwind warnings about missing dark variants
