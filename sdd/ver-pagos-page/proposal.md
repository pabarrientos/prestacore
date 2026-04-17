# Proposal: Página "Ver Pagos" para Admin Dashboard

## Intent

Reemplazar la card "Simulador" en el dashboard admin con una nueva página "Ver Pagos" que permita a admins y vendedores visualizar los pagos realizados en una fecha específica, con filtros adicionales. Esto responde a una necesidad operativa de seguimiento de cobros diarios.

## Scope

### In Scope
- Nueva página `/admin/payments` con tabla de pagos filtrable
- Reemplazar card "Simulador" por card "Ver Pagos" en dashboard
- Agregar item "Pagos" al navbar (visible solo para ADMIN y VENDEDOR)
- Endpoint API GET `/api/payments/by-date?date=YYYY-MM-DD` con filtro por vendor (VENDEDOR ve solo sus préstamos)
- Filtros: fecha (default: hoy), status de pago, número de cuota, cliente
- Soporte dark mode con clases dark:
- Exportación de la propuesta a Engram

### Out of Scope
- Modificar el simulador (solo se reemplaza el link del dashboard)
- Funcionalidad de edición/eliminación de pagos desde esta página
- Reportes o gráficos adicionales

## Capabilities

### New Capabilities
- `payments-view-page`: Nueva página para visualizar pagos por fecha con filtros
- `payments-by-date-api`: Endpoint para obtener pagos filtrados por fecha y vendedor

### Modified Capabilities
- `admin-dashboard`: Reemplazar card Simulador por Ver Pagos
- `admin-navbar`: Agregar link a Pagos para ADMIN y VENDEDOR

## Approach

1. **Backend**: Crear nuevo endpoint `GET /api/payments/by-date` que acepte query params `date` y retorne pagos de esa fecha, filtrando por `assignedVendorId` si el usuario es VENDEDOR
2. **Frontend - Dashboard**: Reemplazar card Simulador (líneas 183-189 en `admin/page.tsx`) por card "Ver Pagos"
3. **Frontend - Navbar**: Agregar `{ href: '/admin/payments', label: 'Pagos' }` a `baseNavLinks` y ajustar filtro para ADMIN/VENDEDOR
4. **Frontend - Página**: Crear `admin/payments/page.tsx` con:
   - Selector de fecha (default: getTodayString() de datetime.ts)
   - Tabla con columnas: Cliente, Préstamo, Cuota, Monto, Status, Fecha
   - Filtros adicionales: status, cliente
   - Soporte dark mode

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/api/src/routes/payments.ts` | New | Endpoint GET /api/payments/by-date |
| `apps/web/src/app/admin/page.tsx` | Modified | Reemplazar card Simulador por Ver Pagos |
| `apps/web/src/app/admin/layout.tsx` | Modified | Agregar link Pagos al navbar |
| `apps/web/src/app/admin/payments/page.tsx` | New | Nueva página de pagos |
| `apps/web/src/lib/datetime.ts` | Read-only | Usar getTodayString() para defaults |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Endpoint nuevo requiere testing de filtros por vendor | Medium | Verificar con datos de seed que VENDEDOR solo ve sus pagos |
| Timezone: posible desalineación entre API y UI | Low | Usar datetime.ts helpers en ambos lados |
| Performance con muchas filas en la tabla | Medium | Implementar paginación si supera 100 registros |

## Rollback Plan

1. Revertir cambios en `admin/page.tsx` (restaurar card Simulador)
2. Revertir cambios en `admin/layout.tsx` (quitar link Pagos)
3. Eliminar archivo `admin/payments/page.tsx`
4. Eliminar endpoint en `payments.ts` (o mantener pero no usado)
5. Descartar branch `feature/ver-pagos-page`

## Dependencies

- API settings endpoint (`/api/settings`) para timezone (ya existe)
- datetime.ts helpers en frontend (ya existen)

## Success Criteria

- [ ] Card "Ver Pagos" visible en dashboard para ADMIN y VENDEDOR
- [ ] Link "Pagos" visible en navbar para ADMIN y VENDEDOR (no para CLIENTE)
- [ ] Página carga por defecto los pagos de hoy (usando timezone configurado)
- [ ] Selector de fecha permite ver pagos de cualquier fecha
- [ ] VENDEDOR solo ve sus propios pagos
- [ ] Dark mode funciona correctamente
- [ ] Tabla muestra: Cliente, Préstamo, Cuota, Monto, Status, Fecha