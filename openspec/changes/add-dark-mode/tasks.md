# Task Breaklist: Dark Mode Implementation — `add-dark-mode`

> **Change**: `add-dark-mode`
> **Branch**: `feat/dark-mode`
> **Total Tasks**: 34
> **Estimated Effort**: ~3-4 hours

---

## Phase 1: Infrastructure (Foundation — MUST be done first)

### T001: Install next-themes dependency
- **Description**: Add `next-themes` v0.3.x to `apps/web/package.json` dependencies. Run `pnpm install` in `apps/web/` to install.
- **Files**: `apps/web/package.json`
- **Details**: Add `"next-themes": "^0.3.0"` to the `dependencies` section. Verify install succeeds with `pnpm install`.
- **Verification**: `pnpm list next-themes` shows installed version.

### T002: Configure Tailwind darkMode class strategy
- **Description**: Add `darkMode: 'class'` to `tailwind.config.js` at the top level of the config object.
- **Files**: `apps/web/tailwind.config.js`
- **Details**: Insert `darkMode: 'class',` before the `content` array. This enables Tailwind's `dark:` prefix variants.
- **Verification**: `pnpm --filter @prestamos/web build` succeeds without Tailwind warnings about dark variants.

### T003: Define CSS custom properties for light/dark themes
- **Description**: Replace the minimal `:root` variables in `globals.css` with the complete color token system for both light and dark themes, plus neon glow utility classes.
- **Files**: `apps/web/src/app/globals.css`
- **Details**:
  - Define `:root` with all base tokens: `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-input`, `--bg-modal-overlay`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`, `--border-default`, `--border-focus`, `--border-error`, `--border-success`, `--accent-neon`, `--accent-secondary`
  - Define all semantic status tokens: `--status-success-bg`, `--status-success-text`, `--status-success-border`, `--status-warning-*`, `--status-error-*`, `--status-info-*`
  - Define loan system tokens: `--loan-paid`, `--loan-pending`, `--loan-overdue`, `--loan-active`
  - Define `.dark` block overriding all base tokens with dark values (per spec table)
  - Define `.dark` semantic status overrides
  - Define neon glow utilities: `.neon-glow`, `.neon-glow-strong`, `.neon-border`, `.neon-text`
  - Add `@media print` rules to force light colors and disable glow
  - Add `@media (prefers-reduced-motion: reduce)` rules to disable transitions
- **Verification**: CSS compiles without errors. Variables resolve correctly when `.dark` class is present on `<html>`.

### T004: Create theme types and constants helper
- **Description**: Create `apps/web/src/lib/theme.ts` with TypeScript types and constants for the theme system.
- **Files**: `apps/web/src/lib/theme.ts` (NEW)
- **Details**:
  - Export `type Theme = 'light' | 'dark' | 'system'`
  - Export `THEME_LABELS: Record<Theme, string>` mapping to Spanish labels: `{ light: 'Claro', dark: 'Oscuro', system: 'Sistema' }`
  - Export `THEME_ICONS: Record<Theme, string>` for icon identifiers
- **Verification**: TypeScript compiles without errors. Types are importable.

---

## Phase 2: Provider + Toggle (Enables theme switching)

### T005: Wrap app with ThemeProvider in providers.tsx
- **Description**: Import `ThemeProvider` from `next-themes` and wrap the existing `AuthProvider` with it in `providers.tsx`.
- **Files**: `apps/web/src/components/providers.tsx`
- **Details**:
  - Import `{ ThemeProvider } from 'next-themes'`
  - Wrap `<AuthProvider>` inside `<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>`
  - Keep `'use client'` directive
- **Verification**: App renders without hydration errors. ThemeProvider is active.

### T006: Add suppressHydrationWarning to root layout html element
- **Description**: Add `suppressHydrationWarning` prop to the `<html>` tag in `layout.tsx` to prevent hydration mismatch from theme class injection.
- **Files**: `apps/web/src/app/layout.tsx`
- **Details**: Change `<html lang="es">` to `<html lang="es" suppressHydrationWarning>`
- **Verification**: No hydration mismatch warnings in browser console.

### T007: Create ThemeToggle component
- **Description**: Create a new `ThemeToggle.tsx` component with 3-state cycling (light → dark → system), mounted check for SSR safety, and sun/moon icons.
- **Files**: `apps/web/src/components/ThemeToggle.tsx` (NEW)
- **Details**:
  - `'use client'` directive
  - Use `useTheme()` from `next-themes` for `theme`, `setTheme`, `resolvedTheme`
  - `useState(false)` + `useEffect(() => setMounted(true), [])` for hydration safety
  - Return placeholder `<div className="w-9 h-9" />` when not mounted
  - Button cycles: `light → dark → system → light`
  - Sun icon (SVG) when in dark mode (click to go light), moon icon when in light/system
  - Neon green `text-[#39ff14]` on moon icon in dark mode
  - `aria-label` in Spanish: "Cambiar a modo claro" / "Cambiar a modo oscuro" / "Usar tema del sistema"
  - Classes: `p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition`
- **Verification**: Component renders, cycles through 3 states, localStorage persists, no hydration mismatch.

### T008: Write unit test for ThemeToggle
- **Description**: Create a basic unit test for the ThemeToggle component.
- **Files**: `apps/web/src/components/ThemeToggle.test.tsx` (NEW)
- **Details**:
  - Test that toggle button renders
  - Test that it has correct aria-label
  - Test that it cycles themes on click (mock `useTheme`)
- **Verification**: `pnpm test` passes for ThemeToggle tests.

---

## Phase 3: Admin Layout + Settings (Visible navigation + theme control)

### T009: Add dark mode to admin layout — nav bar
- **Description**: Add `dark:` variants to the admin layout's nav bar, loading spinner, and secondary navigation links. Integrate ThemeToggle component.
- **Files**: `apps/web/src/app/admin/layout.tsx`
- **Details**:
  - Import `ThemeToggle` component
  - Main container: `bg-gray-50` → add `dark:bg-[#121212]`
  - Nav bar: `bg-white shadow-sm` → add `dark:bg-[#1a1a1a] dark:shadow-none dark:border-b dark:border-[#333333]`
  - Brand heading: `text-primary-700` → add `dark:text-[#39ff14]`
  - User info text: `text-gray-500` / `text-gray-600` → add `dark:text-white/60`
  - "Inicio" link: `text-gray-600 hover:text-gray-900` → add `dark:text-white/60 dark:hover:text-[#39ff14]`
  - "Cerrar sesión" button: same dark variants
  - Place `<ThemeToggle />` between "Inicio" link and "Cerrar sesión" button
  - Secondary nav inactive: `text-gray-500 hover:text-gray-700` → add `dark:text-white/60 dark:hover:text-white/87`
  - Secondary nav active: `text-primary-600 border-b-2 border-primary-600` → add `dark:text-[#39ff14] dark:border-b-2 dark:border-[#39ff14]`
  - Loading spinner: `border-primary-600` → add `dark:border-[#39ff14]`
  - Loading text: `text-gray-600` → add `dark:text-white/60`
  - Loading container: add `dark:bg-[#121212]`
- **Verification**: Admin nav renders correctly in both themes. Toggle is visible. Active nav link shows neon green border in dark mode.

### T010: Add theme selector to admin settings page
- **Description**: Add an "Apariencia" section to the settings page with light/dark/system buttons.
- **Files**: `apps/web/src/app/admin/settings/page.tsx`
- **Details**:
  - Import `useTheme` from `next-themes` and `Theme` type from `@/lib/theme`
  - Add new card section with heading "Apariencia" and description "Selecciona el tema de la interfaz"
  - Three buttons: light (☀️ Claro), dark (🌙 Oscuro), system (💻 Sistema)
  - Active button: `border-[#39ff14] bg-[#39ff14]/10 text-[#39ff14]`
  - Inactive button: `border-gray-300 dark:border-gray-700 text-gray-700 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5`
  - Add `dark:` variants to ALL existing elements on the page (cards, text, borders, inputs)
  - Card: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Headings: add `dark:text-white/87`
  - Descriptions: `text-gray-500` → add `dark:text-white/60`
  - Inputs: add `dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/87 dark:focus:ring-[#39ff14]`
  - Buttons: add neon dark variants per button conversion pattern
- **Verification**: Settings page renders in dark mode. Theme selector buttons work and change theme immediately.

---

## Phase 4: Auth Pages (Public-facing, simple — can be done in parallel)

### T011: Add dark mode to landing page (home)
- **Description**: Add `dark:` variants to the root landing page.
- **Files**: `apps/web/src/app/page.tsx`
- **Details**:
  - Page background: add `dark:bg-[#121212]`
  - Cards/containers: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Headings: `text-gray-900` → add `dark:text-white/87`
  - Body text: `text-gray-600` → add `dark:text-white/60`
  - Muted text: `text-gray-400` → add `dark:text-white/38`
  - Primary buttons: add `dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]`
  - Secondary/outline buttons: add `dark:border-[#39ff14] dark:text-[#39ff14] dark:hover:bg-[#39ff14]/10`
  - Feature cards: `bg-white hover:shadow-md` → add `dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)]`
  - Dividers/borders: add `dark:border-[#333333]`
- **Verification**: Landing page renders correctly in both themes. CTAs show neon green in dark mode.

### T012: Add dark mode to login page
- **Description**: Add `dark:` variants to the login form page.
- **Files**: `apps/web/src/app/login/page.tsx`
- **Details**:
  - Page background: add `dark:bg-[#121212]`
  - Login card: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Title: add `dark:text-white/87`
  - Labels: `text-gray-700` → add `dark:text-white/60`
  - Inputs: add `dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/87 dark:focus:ring-[#39ff14] dark:focus:border-[#39ff14]`
  - Error messages: `text-red-600` → add `dark:text-red-400`
  - Error alert boxes: `bg-red-50 border-red-200` → add `dark:bg-red-950/50 dark:border-red-900`
  - Submit button: add neon dark variants
  - Link text: add `dark:text-[#39ff14] dark:hover:text-[#39ff14]`
  - Spinner: add `dark:border-[#39ff14]`
- **Verification**: Login form is fully usable in dark mode. Inputs have visible borders and readable text.

### T013: Add dark mode to register page
- **Description**: Add `dark:` variants to the registration form page.
- **Files**: `apps/web/src/app/register/page.tsx`
- **Details**: Same pattern as T012 (login page). Apply to all form fields, labels, buttons, error states, and the registration card.
- **Verification**: Registration form is fully usable in dark mode.

---

## Phase 5: Admin Pages (Dashboard + CRUD — can be done in parallel within phase)

### T014: Add dark mode to admin dashboard page
- **Description**: Add `dark:` variants to the admin dashboard with stat cards and quick action cards.
- **Files**: `apps/web/src/app/admin/page.tsx`
- **Details**:
  - Stat cards: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Stat values: `text-gray-900` → add `dark:text-white/87`
  - Stat labels: `text-gray-500` → add `dark:text-white/60`
  - Quick action cards: `bg-white hover:shadow-md` → add `dark:bg-[#1e1e1e] dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.15)]`
  - Action card titles: add `dark:text-white/87`
  - Action card descriptions: add `dark:text-white/60`
  - Status badges in stats: apply `dark:bg-X-900/50 dark:text-X-400` pattern
  - Page heading: add `dark:text-white/87`
  - Section headings: add `dark:text-white/87`
- **Verification**: Dashboard renders correctly. Stat cards and action cards have proper dark backgrounds.

### T015: Add dark mode to admin loans list page
- **Description**: Add `dark:` variants to the loans list page with table.
- **Files**: `apps/web/src/app/admin/loans/page.tsx`
- **Details**:
  - Page heading: add `dark:text-white/87`
  - Table: `divide-gray-200` → add `dark:divide-gray-700`
  - Table header: `bg-gray-50` → add `dark:bg-[#1a1a1a]`
  - Header text: `text-gray-600` → add `dark:text-white/60`
  - Table body: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Table rows: `border-t` → add `dark:border-gray-800`
  - Row hover: add `dark:hover:bg-white/10`
  - Cell text: `text-gray-900` → add `dark:text-white/87`
  - Status badges: apply `dark:bg-X-900/50 dark:text-X-400` pattern for PAID, PENDING, OVERDUE, ACTIVE
  - Action buttons: add neon dark variants
  - Empty state text: add `dark:text-white/60`
- **Verification**: Table is readable in dark mode. Status badges use dark-tinted backgrounds.

### T016: Add dark mode to admin loans new page
- **Description**: Add `dark:` variants to the new loan creation form.
- **Files**: `apps/web/src/app/admin/loans/new/page.tsx`
- **Details**:
  - Form card: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Form heading: add `dark:text-white/87`
  - Labels: `text-gray-700` → add `dark:text-white/60`
  - Inputs: add `dark:bg-[#2a2a2a] dark:border-[#333333] dark:text-white/87 dark:focus:ring-[#39ff14]`
  - Select dropdowns: same input dark variants
  - Error text: add `dark:text-red-400`
  - Submit button: add neon dark variants
  - Cancel/back button: add `dark:border-[#39ff14] dark:text-[#39ff14] dark:hover:bg-[#39ff14]/10`
  - Info/help text: `text-gray-500` → add `dark:text-white/60`
- **Verification**: New loan form is fully usable in dark mode.

### T017: Add dark mode to admin loan detail page
- **Description**: Add `dark:` variants to the loan detail view page (`[id]/page.tsx`).
- **Files**: `apps/web/src/app/admin/loans/[id]/page.tsx`
- **Details**:
  - Detail card: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Detail headings: add `dark:text-white/87`
  - Detail labels: add `dark:text-white/60`
  - Detail values: add `dark:text-white/87`
  - Status badge: apply dark pattern
  - Payment history table: apply table dark pattern (header, body, rows, dividers)
  - Action buttons: add neon dark variants
  - Info alert boxes: `bg-blue-50 border-blue-200` → add `dark:bg-blue-950/50 dark:border-blue-900`
  - Info alert text: `text-blue-700` → add `dark:text-blue-400`
- **Verification**: Loan detail page renders correctly in dark mode. Payment table is readable.

### T018: Add dark mode to admin loan edit page
- **Description**: Add `dark:` variants to the loan edit form (`[id]/edit/page.tsx`).
- **Files**: `apps/web/src/app/admin/loans/[id]/edit/page.tsx`
- **Details**: Same pattern as T016 (new loan form). Apply to all form fields, labels, buttons, error states, and the edit card.
- **Verification**: Edit loan form is fully usable in dark mode.

### T019: Add dark mode to admin clients list page
- **Description**: Add `dark:` variants to the clients list page with table.
- **Files**: `apps/web/src/app/admin/clients/page.tsx`
- **Details**: Same table pattern as T015 (loans list). Apply to table header, body, rows, status badges, action buttons, and page heading.
- **Verification**: Clients table is readable in dark mode.

### T020: Add dark mode to admin new client page
- **Description**: Add `dark:` variants to the new client creation form.
- **Files**: `apps/web/src/app/admin/clients/new/page.tsx`
- **Details**: Same form pattern as T016. Apply to all form fields, labels, buttons, error states.
- **Verification**: New client form is fully usable in dark mode.

### T021: Add dark mode to admin client detail page
- **Description**: Add `dark:` variants to the client detail view page (`[id]/page.tsx`).
- **Files**: `apps/web/src/app/admin/clients/[id]/page.tsx`
- **Details**: Same detail pattern as T017. Apply to detail cards, tables, status badges, action buttons.
- **Verification**: Client detail page renders correctly in dark mode.

### T022: Add dark mode to admin overdue page
- **Description**: Add `dark:` variants to the overdue loans management page.
- **Files**: `apps/web/src/app/admin/overdue/page.tsx`
- **Details**:
  - Page heading: add `dark:text-white/87`
  - Overdue cards/rows: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Overdue amounts: `text-red-600` → add `dark:text-red-400`
  - Overdue status badges: apply `dark:bg-red-900/50 dark:text-red-400`
  - Action buttons (send reminder, etc.): add neon dark variants
  - Table pattern if applicable: same as T015
  - Warning/info alerts: apply dark alert patterns
- **Verification**: Overdue page renders correctly. Red status indicators are visible and readable.

---

## Phase 6: Shared Components (Complex modals + forms)

### T023: Add dark mode to simulator page
- **Description**: Add `dark:` variants to the loan simulator page.
- **Files**: `apps/web/src/app/simulator/page.tsx`
- **Details**:
  - Simulator card: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Form inputs: add dark input variants
  - Labels: add `dark:text-white/60`
  - Results section: add `dark:bg-[#1a1a1a]`
  - Result values: add `dark:text-white/87`
  - Result labels: add `dark:text-white/60`
  - Calculate button: add neon dark variants
  - Amortization table (if present): apply table dark pattern
  - Page heading: add `dark:text-white/87`
- **Verification**: Simulator is fully functional in dark mode. Results are readable.

### T024: Add dark mode to PaymentForm component
- **Description**: Add `dark:` variants to the PaymentForm shared component.
- **Files**: `apps/web/src/components/PaymentForm.tsx`
- **Details**:
  - Form container: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Form heading: add `dark:text-white/87`
  - Labels: add `dark:text-white/60`
  - Inputs: add dark input variants with `dark:focus:ring-[#39ff14]`
  - Success alert: `bg-green-50 border-green-200 text-green-600` → add `dark:bg-green-950/50 dark:border-green-900 dark:text-green-400`
  - Error alert: `bg-red-50 border-red-200 text-red-600` → add `dark:bg-red-950/50 dark:border-red-900 dark:text-red-400`
  - Submit button: add neon dark variants
  - Amount display: add `dark:text-white/87`
  - Spinner: add `dark:border-[#39ff14]`
- **Verification**: Payment form renders correctly in dark mode. Success/error alerts are visible.

### T025: Add dark mode to RefinancingModal component
- **Description**: Add `dark:` variants to the RefinancingModal (heavy orange theming).
- **Files**: `apps/web/src/components/RefinancingModal.tsx`
- **Details**:
  - Modal backdrop: `bg-black bg-opacity-50` → add `dark:bg-opacity-70`
  - Modal content: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Modal heading: add `dark:text-white/87`
  - Orange sections:
    - `bg-orange-50` → add `dark:bg-orange-950/50`
    - `border-orange-200` → add `dark:border-orange-900`
    - `text-orange-800` → add `dark:text-orange-400`
    - `text-orange-700` → add `dark:text-orange-400`
    - `text-orange-900` → add `dark:text-orange-300`
    - `text-orange-600` → add `dark:text-orange-500`
    - `border-orange-300` (inputs) → add `dark:border-orange-700`
    - `focus:ring-orange-500` → add `dark:focus:ring-orange-600`
  - Info/blue buttons: apply blue dark pattern
  - Close button: add `dark:text-white/60 dark:hover:text-white/87`
  - Form inputs inside modal: add dark input variants
  - Submit buttons: add neon dark variants
- **Verification**: Modal renders correctly in dark mode. Orange semantic meaning is preserved with readable contrast.

### T026: Add dark mode to CancelacionAnticipadaModal component
- **Description**: Add `dark:` variants to the CancelacionAnticipadaModal (heavy green theming).
- **Files**: `apps/web/src/components/CancelacionAnticipadaModal.tsx`
- **Details**:
  - Modal backdrop: add `dark:bg-opacity-70`
  - Modal content: `bg-white` → add `dark:bg-[#1e1e1e]`
  - Modal heading: add `dark:text-white/87`
  - Green sections:
    - `bg-green-50` → add `dark:bg-green-950/50`
    - `border-green-200` → add `dark:border-green-900`
    - `text-green-800` → add `dark:text-green-400`
    - `text-green-700` → add `dark:text-green-400`
    - `text-green-900` → add `dark:text-green-300`
    - `text-green-600` → add `dark:text-green-500`
    - `bg-green-600` (total box) → add `dark:bg-green-700`
    - `border-green-300` (inputs) → add `dark:border-green-700`
    - `focus:ring-green-500` → add `dark:focus:ring-green-600`
  - Form inputs: add dark input variants
  - Submit buttons: add neon dark variants
  - Close button: add dark variants
- **Verification**: Modal renders correctly in dark mode. Green semantic meaning is preserved.

---

## Phase 7: Polish & Verification

### T027: Add neon glow hover effect to primary CTA buttons across all pages
- **Description**: Audit all primary CTA buttons across all 17 files and ensure they have the neon glow shadow on hover in dark mode.
- **Files**: All page and component files (T011–T026)
- **Details**: Every primary button should have:
  - `dark:bg-[#39ff14] dark:text-black dark:hover:bg-[#32e012]`
  - `dark:hover:shadow-[0_0_15px_rgba(57,255,20,0.4)]`
  - `transition` for smooth hover
- **Verification**: In dark mode, hover over every primary CTA and confirm neon glow appears.

### T028: Review and fix all hover/focus states in dark mode
- **Description**: Systematic review of all interactive elements (buttons, links, inputs, nav items, cards, table rows) to ensure hover and focus states work correctly in dark mode.
- **Files**: All modified files
- **Details**: Check against the Interactive State Mapping table from the spec:
  - Primary button: hover glow, focus ring
  - Secondary button: hover background
  - Input: focus ring + border color
  - Link: hover color
  - Nav link: active state with glow
  - Card: hover shadow
  - Table row: hover background
- **Verification**: Tab through all interactive elements in dark mode. Confirm visible focus rings. Hover all elements.

### T029: Accessibility verification — contrast ratios
- **Description**: Verify all text-to-background contrast ratios meet WCAG AA (≥ 4.5:1 for normal text, ≥ 3:1 for large text) in dark mode.
- **Files**: All modified files
- **Details**:
  - Use browser DevTools or a contrast checker tool
  - Verify: `rgba(255,255,255,0.87)` on `#121212` = 15.4:1 ✅
  - Verify: `rgba(255,255,255,0.60)` on `#121212` = 7.5:1 ✅
  - Verify: `#39ff14` on `#121212` = 11.8:1 ✅ (large text/UI only)
  - Verify all status badge text on their dark backgrounds
  - Verify all alert box text
- **Verification**: All text passes WCAG AA. No failures.

### T030: Accessibility verification — screen reader announcements
- **Description**: Ensure theme changes are announced by screen readers via `aria-live` region.
- **Files**: `apps/web/src/components/ThemeToggle.tsx`
- **Details**:
  - Add an `aria-live="polite"` region that announces theme changes in Spanish
  - "Tema cambiado a oscuro" when switching to dark
  - "Tema cambiado a claro" when switching to light
  - "Tema cambiado a sistema" when switching to system
- **Verification**: Use browser screen reader or accessibility inspector to confirm announcements.

### T031: Print styles verification
- **Description**: Verify print stylesheet forces light colors and disables neon glow effects.
- **Files**: `apps/web/src/app/globals.css`
- **Details**:
  - Add `@media print` block that:
    - Forces `background: none !important` on all elements
    - Forces text colors to dark
    - Disables all box-shadows (neon glow)
    - Disables all transitions
- **Verification**: Print preview shows clean light-mode output with no dark backgrounds or neon effects.

### T032: Reduced motion preference verification
- **Description**: Verify `prefers-reduced-motion: reduce` disables neon glow transitions and theme change animations.
- **Files**: `apps/web/src/app/globals.css`
- **Details**:
  - Add `@media (prefers-reduced-motion: reduce)` block that overrides all `transition` properties to `none`
  - Disable neon glow animations
  - Confirm `disableTransitionOnChange` on ThemeProvider is working
- **Verification**: Set reduced motion in browser DevTools. Toggle theme — should be instant with no animation.

### T033: Cross-browser testing
- **Description**: Test dark mode in Chrome, Firefox, and Safari (if available).
- **Files**: N/A (manual testing)
- **Details**:
  - Chrome 90+: Full dark mode support
  - Firefox 88+: Full dark mode support
  - Safari 15.4+: Full dark mode support
  - Verify: theme toggle works, no FOUC, localStorage persists, all pages render correctly
- **Verification**: All browsers pass visual checklist.

### T034: Final build verification
- **Description**: Run full production build and verify no errors or warnings.
- **Files**: N/A (build command)
- **Details**:
  - Run `pnpm --filter @prestamos/web build`
  - Verify: no Tailwind warnings about missing dark variants
  - Verify: no TypeScript errors
  - Verify: no hydration warnings
  - Verify: build output size is reasonable (next-themes is ~1.2kb)
- **Verification**: Build succeeds cleanly. No warnings.

---

## Dependency Graph

```
Phase 1 (Infrastructure)
  T001 ──┐
  T002 ──┼── T003 ──┐
  T004 ──┘          │
                    ▼
Phase 2 (Provider + Toggle)
  T005 ← T003       T006 ← T005
  T007 ← T005, T004
  T008 ← T007
                    ▼
Phase 3 (Admin Layout + Settings)
  T009 ← T007, T006
  T010 ← T009, T007
                    ▼
Phase 4 (Auth Pages — parallel)
  T011 ← T006
  T012 ← T006
  T013 ← T006
                    ▼
Phase 5 (Admin Pages — parallel)
  T014 ← T009
  T015 ← T009
  T016 ← T009
  T017 ← T009
  T018 ← T009
  T019 ← T009
  T020 ← T009
  T021 ← T009
  T022 ← T009
                    ▼
Phase 6 (Shared Components — parallel)
  T023 ← T006
  T024 ← T003
  T025 ← T003
  T026 ← T003
                    ▼
Phase 7 (Polish & Verification)
  T027 ← All T011-T026
  T028 ← All T011-T026
  T029 ← All T011-T026
  T030 ← T007
  T031 ← T003
  T032 ← T003
  T033 ← All T011-T026
  T034 ← All tasks
```

## Quick Reference: Dark Mode Color Values

| Token | Light | Dark |
|-------|-------|------|
| Page bg | `bg-gray-50` | `dark:bg-[#121212]` |
| Card bg | `bg-white` | `dark:bg-[#1e1e1e]` |
| Secondary bg | `bg-gray-50` | `dark:bg-[#1a1a1a]` |
| Input bg | `bg-white` | `dark:bg-[#2a2a2a]` |
| Text primary | `text-gray-900` | `dark:text-white/87` |
| Text secondary | `text-gray-600` | `dark:text-white/60` |
| Text muted | `text-gray-400` | `dark:text-white/38` |
| Border default | `border-gray-300` | `dark:border-[#333333]` |
| Primary CTA | `bg-primary-600` | `dark:bg-[#39ff14] dark:text-black` |
| Focus ring | `focus:ring-primary-500` | `dark:focus:ring-[#39ff14]` |
| Status success | `bg-green-100 text-green-800` | `dark:bg-green-900/50 dark:text-green-400` |
| Status error | `bg-red-100 text-red-800` | `dark:bg-red-900/50 dark:text-red-400` |
| Status warning | `bg-yellow-100 text-yellow-800` | `dark:bg-yellow-900/50 dark:text-yellow-400` |
| Status info | `bg-blue-100 text-blue-800` | `dark:bg-blue-900/50 dark:text-blue-400` |
