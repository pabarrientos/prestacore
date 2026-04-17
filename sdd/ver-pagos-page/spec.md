# Spec: Página "Ver Pagos" para Admin Dashboard

**Artifact**: spec  
**topic_key**: sdd/ver-pagos-page/spec  
**Parent Proposal**: sdd/ver-pagos-page/proposal

---

## ADDED Requirements

### Req: Visualización de Pagos por Fecha

El sistema DEBE mostrar página en `/admin/pagos` para ADMIN/VENDEDOR con pagos de fecha específica.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Carga fecha hoy | Admin autenticado | Navega a /admin/pagos | Muestra pagos de fecha actual (timezone) |
| Cambio fecha | Con pagos cargados | Cambia fecha + busca | Actualiza tabla con pagos de fecha seleccionada |
| Vendedor ve propios | Vendedor autenticado | Navega a /admin/pagos | Muestra solo sus pagos |

---

### Req: Filtros Adicionales

El sistema DEBE permitir filtrar por estado de pago y nombre de cliente.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Filtro estado | Con resultados visibles | Selecciona estado | Muestra solo pagos de ese estado |
| Filtro cliente | En página de pagos | Escribe nombre | Muestra clientes que contain texto (case-insensitive) |
| Filtros combos | Con filtro activo | Aplica otro filtro | Aplica TODOS los filtros |

---

### Req: Endpoint API /payments/by-date

El sistema DEBE proporcionar endpoint `GET /api/payments/by-date` con filtros y restricciones por rol.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Admin fecha | Admin autenticado | GET /api/payments/by-date?date=2024-01-15 | Retorna todos pagos de esa fecha con datos cliente |
| Vendedor filtro | Vendedor ID "v-123" | GET /api/payments/by-date?date=... | Retorna solo pagos de assignedVendorId="v-123" |
| Sin fecha | Usuario autenticado | GET /api/payments/by-date sin date | Usa fecha actual del timezone |

---

### Req: Tarjeta "Ver Pagos" en Dashboard

El sistema DEBE mostrar tarjeta "Ver Pagos"→`/admin/pagos` reemplazando "Simulador".

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Admin ve card | Admin en /admin | Página carga | Ve card "Ver Pagos" (no "Simulador") |
| Vendedor ve card | Vendedor en /admin | Página carga | Ve card "Ver Pagos" |

---

### Req: Navbar "Pagos"

El sistema DEBE incluir enlace "Pagos" visible solo para ADMIN y VENDEDOR.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| ADMIN ve Pagos | Admin en /admin/* | Navbar renderiza | Muestra enlace "Pagos"→/admin/pagos |
| VENDEDOR ve Pagos | Vendedor en /admin/* | Navbar renderiza | Muestra enlace "Pagos" |
| CLIENTE no ve | CLIENTE (si fuera) | Navbar renderiza | NO muestra "Pagos" |

---

### Req: Soporte Dark Mode

La página DEBE renderizar correctamente en modo oscuro.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Dark mode | Dark enabled | Navega a /admin/pagos | Usa clases dark: apropiadas, texto legible |

---

## MODIFIED Requirements

### Req: Dashboard Admin Cards

(Previously: card "Simulador" visible)

El sistema DEBE mostrar cards: Préstamos, Cuotas Vencidas, Clientes, Ver Pagos. "Simulador" NO DEBE aparecer.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Cards show | Admin en /admin | Página carga | Muestra 4 cards listed, no Simulador |

---

## REMOVED Requirements

### Req: Simulador en Dashboard

(Reason: Reemplazado por Ver Pagos)

Card "Simulador" NO DEBE mostrarse en dashboard admin.

---

## Acceptance Criteria

| AC | Criterio | Tipo |
|----|---------|------|
| AC1 | Card "Ver Pagos" visible (ADMIN/VENDEDOR) | Visual |
| AC2 | Link "Pagos" en navbar (ADMIN/VENDEDOR, no CLIENTE) | Visual |
| AC3 | Carga pagos de hoy (timezone) | Funcional |
| AC4 | Selector fecha funciona | Funcional |
| AC5 | Filtros estado/cliente funcionan | Funcional |
| AC6 | VENDEDOR ve solo sus pagos | Funcional |
| AC7 | Dark mode funciona | Visual |
| AC8 | Tabla: Cliente, Préstamo, Cuota, Monto, Status, Fecha | Visual |

---

## Notas de Implementación

- API: `GET /api/payments/by-date?date=YYYY-MM-DD&status=?&client=`
- Frontend: `/admin/pagos/page.tsx`
- Usar `getTodayString()` de `datetime.ts` para default
- Dark mode: `dark:bg-[#121212]`, `dark:text-white`