# Proposal: Input de Mora Modificable en Formulario de Pago

## Intent
Permitir modificar el monto de mora en el formulario de pago y registrarlo como pago separado (abono a cuenta) con notas descriptivas para rastrear si se perdonó o cobró más mora.

## Scope

### In Scope
- Input de mora modificable en PaymentForm
- Endpoint nuevo POST /api/payments/mora
- Notas automáticas en pago de mora (cuota, montos original/modificado, días)
- Recálculo de mora al cambiar fecha de pago
- Control de acceso por rol (fecha solo admin, monto admin+vendedor)

### Out of Scope
- Cambios en cálculo de mora (fórmula existente se mantiene)
- Notificaciones al usuario
- Historial de modificaciones de mora

## Capabilities

### New Capabilities
- `mora-payment-input`: Input editable para monto de mora en formulario de pago
- `mora-payment-tracking`: Registro de mora por separado con notas descriptivas
- `mora-date-recalculation`: Recálculo automático al cambiar fecha de pago

### Modified Capabilities
- `payment-form`: Agregar input de mora y control de acceso por rol

## Approach
Frontend + nuevo endpoint backend:
1. PaymentForm.tsx: agregar input mora, validar rol para fecha
2. POST /api/payments/mora: registro de mora con notas
3.payment.ts: procesar dos pagos (cuota + mora) en transacción si es posible

## Affected Areas
| Area | Impact | Description |
|------|--------|-------------|
| apps/web/src/components/PaymentForm.tsx | Modified | Agregar input mora |
| apps/api/src/routes/payments.ts | Modified/Nuevo | Endpoint mora |
| apps/api/src/services/payment.ts | Modified | Lógica dos pagos |
| apps/api/src/services/mora.ts | Modified | Recálculo por fecha |
| apps/api/src/middleware/rbac.ts | Modified | Control fecha |

## Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fail en uno de dos pagos | Medium | Transacción o rollback manual |
| Mora $0 persistida | Low | Es válido, permite track |

## Rollback Plan
1. Revertir PaymentForm a versión anterior
2. Eliminar endpoint /payments/mora
3. Regenerar migración si hay cambios en schema

## Dependencies
- Ninguna dependencia externa

## Success Criteria
- [ ] Input de mora visible y editable en formulario
- [ ] Notas contienen cuota, monto original, días originales
- [ ] Registro de mora por $0 cuando se perdona
- [ ] Fecha solo editable por admin
- [ ] Monto editable por admin y vendedor