# Design: Multi-System Loan Amortization

## Overview

Implementar un sistema de amortización con múltiples métodos de cálculo (Francés, Alemán, Americano) donde el usuario puede seleccionar el sistema a usar y configurar un sistema por defecto a nivel global.

## Architecture

### Enum Definition

**Decisión**: Opción C — Definir enum en ambos lugares.

**Rationale**:
- Prisma schema para persistencia en DB (necesario si guardamos el sistema seleccionado en elLoan)
- Paquete shared para uso en API (evita importing @prisma/client en frontend)
- Pattern existente: Role, LoanStatus, PaymentFrequency ya siguen este patrón

**Implementation**:

```typescript
// packages/shared/src/index.ts (agregar después de PaymentFrequency)
export enum AmortizationSystemType {
  FRENCH = 'FRENCH',    // Sistema Francés (cuota fija)
  GERMAN = 'GERMAN',     // Sistema Alemán (amortización constante)
  AMERICAN = 'AMERICAN' // Sistema Americano (solo intereses)
}
```

```prisma
// packages/database/prisma/schema.prisma (después de PaymentFrequency)
enum AmortizationSystemType {
  FRENCH
  GERMAN
  AMERICAN
}
```

**Nota**: Agregar campo `amortizationSystem` al modelo Loan en schema.prisma.

---

### Service Design

**Decisión**: Opción B — Métodos privados por sistema.

**Rationale**:
- Mantiene la API pública simple (`AmortizationService.calculate(input, systemType?)`)
- Aísla cada cálculo para testing independiente
- Evita un switch gigante en el método principal
- Menos complejidad que factory pattern (overhead innecesario para 3 métodos)

**AmortizationService Structure**:

```typescript
export class AmortizationService {
  // Método principal público
  static calculate(input: AmortizationInput, system?: AmortizationSystemType): AmortizationResult {
    const systemType = system ?? this.getDefaultSystem();
    switch (systemType) {
      case AmortizationSystemType.FRENCH:
        return this.calculateFrench(input);
      case AmortizationSystemType.GERMAN:
        return this.calculateGerman(input);
      case AmortizationSystemType.AMERICAN:
        return this.calculateAmerican(input);
    }
  }

  // Privados por sistema
  private static calculateFrench(input: AmortizationInput): AmortizationResult { /* ... */ }
  private static calculateGerman(input: AmortizationInput): AmortizationResult { /* ... */ }
  private static calculateAmerican(input: AmortizationInput): AmortizationResult { /* ... */ }

  // Helper
  private static async getDefaultSystem(): Promise<AmortizationSystemType> {
    // Leer Setting.DEFAULT_AMORTIZATION_SYSTEM
  }
}
```

**AmortizationInput expansion**:

```typescript
export interface AmortizationInput {
  amount: number;
  interestRate: number;
  termMonths: number;
  frequency: PaymentFrequency;
  startDate?: Date;
  system?: AmortizationSystemType; // Opcional, para override
}
```

---

### API Contract

**Decisión**: El sistema se pasa como parámetro opcional en todos los endpoints que calculan amortización.

**Affected Routes**:

| Route | Method | system Parameter |
|-------|-------|----------------|
| /api/loans/simulate | POST | body.system opcional |
| /api/loans | POST | body.system opcional |
| /api/loans/:id | PATCH | body.system opcional |
| /api/loans/:id/approve | POST | body.system opcional |

**Request Example**:

```json
POST /api/loans/simulate
{
  "amount": 10000,
  "interestRate": 0.15,
  "termMonths": 12,
  "frequency": "MONTHLY",
  "system": "FRENCH"  // opcional, usa DEFAULT si no se envía
}
```

**Response**: Sin cambios en estructura — solo cambia el contenido del schedule.

---

### Settings Access

**Decisión**: Extender Setting service existente.

**Rationale**:
- Pattern establecidos: Setting usa key-value strings (model Setting con key String, value String)
- Solo necesitamos agregar validación de tipo para el valor

**Settings Keys**:

| Key | Type | Default | Description |
|----|------|---------|--------------|
| DEFAULT_AMORTIZATION_SYSTEM | AmortizationSystemType | FRENCH | Sistema de amortización por defecto |

**Implementation**:

```typescript
// apps/api/src/services/settings.ts (nuevo o existente)
import { AmortizationSystemType } from '@prestamos/shared';

export const SETtingKeys = {
  DEFAULT_AMORTIZATION_SYSTEM: 'DEFAULT_AMORTIZATION_SYSTEM',
} as const;

export async function getDefaultAmortizationSystem(): Promise<AmortizationSystemType> {
  const setting = await prisma.setting.findUnique({
    where: { key: SETTING_KEYS.DEFAULT_AMORTIZATION_SYSTEM }
  });
  // Validar que sea un valor válido de enum
  if (!Object.values(AmortizationSystemType).includes(setting?.value as AmortizationSystemType)) {
    return AmortizationSystemType.FRENCH; // Fallback seguro
  }
  return setting.value as AmortizationSystemType;
}
```

**Settings Validation**: En routes/settings.ts, agregar schema específico para DEFAULT_AMORTIZATION_SYSTEM con enum validation.

---

### Frontend Integration

**Decisión**: Opción 2 de las originales — Backend returns full schedule, frontend displays.

**Rationale**:
- Frontend actualmente usa el schedule devuelto por API para display
- Elpreview del simulador también recibe el schedule completo
- No necesitamos lógica duplicada — el backend es la fuente de verdad
- E2E tests aseguran consistencia

**Frontend Changes**:

1. Agregar dropdown/selector en el simulador (UI)
2. Enviar `system` parameter al API en requests
3. Mostrar label del sistema usado en el resultado
4. Persistir preferencia en localStorage (opcional, no requerido por spec)

**API Endpoint para obtener sistemas disponibles**:

```typescript
// GET /api/amortization/systems
// Returns: { FRENCH: "Sistema Francés (cuota fija)", GERMAN: "Sistema Alemán", AMERICAN: "Sistema Americano" }
```

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| apps/api/src/services/settings.ts | Funciones helper para leer settings con tipos |
| .specs/multi-system-amortization-design.md | Este documento |

### Modified Files

| File | Changes |
|------|---------|
| packages/shared/src/index.ts | Agregar enum AmortizationSystemType |
| packages/database/prisma/schema.prisma | + enum AmortizationSystemType, + campo amortizationSystem en Loan |
| apps/api/src/services/amortization.ts | + métodos calculateGerman, calculateAmerican, lógica de sistema |
| apps/api/src/routes/loans.ts | + acepta body.system en endpoints que calculan amortización |
| apps/api/src/routes/settings.ts | + validación para DEFAULT_AMORTIZATION_SYSTEM, + endpoint /systems |
| apps/api/src/services/amortization.test.ts | + tests para cada método |

### Deleted Files

| File | Reason |
|------|--------|
| None | — |

---

## Implementation Order

### Phase 1: Database & Types (Bloque 1)
1. Agregar enum AmortizationSystemType a schema.prisma
2. Agregar campo amortizationSystem al modelo Loan (opcional, null = usar default)
3. Ejecutar `pnpm db:migrate`
4. Agregar enum a packages/shared/src/index.ts

### Phase 2: Core Service (Bloque 2)
5. Extender AmortizationInput interface
6. Agregar método calculateGerman()
7. Agregar método calculateAmerican()
8. Modificar calculate() para usar sistema por defecto
9. Unit tests para los 3 métodos

### Phase 3: Settings Integration (Bloque 3)
10. Crear services/settings.ts con getDefaultAmortizationSystem()
11. Agregar validación en routes/settings.ts
12. Agregar endpoint GET /api/amortization/systems
13. Agregar setting DEFAULT_AMORTIZATION_SYSTEM por defecto

### Phase 4: API Routes (Bloque 4)
14. Actualizar POST /api/loans/simulate
15. Actualizar POST /api/loans
16. Actualizar PATCH /api/loans/:id
17. Actualizar POST /api/loans/:id/approve

### Phase 5: Frontend (Bloque 5)
18. Agregar selector de sistema en UI del simulador
19. Enviar system en requests al API
20. Display del sistema usado en resultados

### Phase 6: Testing (Bloque 6)
21. Integration tests para cada route
22. E2E tests para el flow completo

---

## Test Strategy

### Unit Tests (amortization.test.ts)

```typescript
describe('AmortizationService', () => {
  describe('calculateFrench', () => {
    it('calculates equal installments', () => { /* ... */ })
    it('handles zero interest rate', () => { /* ... */ })
  });

  describe('calculateGerman', () => {
    it('calculates constant principal', () => { /* ... */ })
  });

  describe('calculateAmerican', () => {
    it('pays only interest, then principal', () => { /* ... */ })
  });

  describe('calculate with system', () => {
    it('uses DEFAULT when system not provided', () => { /* ... */ })
    it('uses provided system over default', () => { /* ... */ })
  });
});
```

### Integration Tests

- POST /api/loans/simulate con cada sistema
- Verificar que el schedule tiene estructura correcta
- Verificar totalPayment = sum(schedule[].amount)

### E2E Tests (Playwright)

- Frontend: seleccionar sistema → verificar schedule en UI
- Frontend: crear loan con sistema → verificar en DB

### Contract Tests

- Mismo input produce mismo output en-backend y en-frontend-preview
- Usar fixtures con valores hardcodeados para regresión

---

## Dependencies

- **Prisma**: Migration requerida (schema change)
- **Zod**: Validación de settings
- **Vitest**: Unit tests (existente)
- **Playwright**: E2E tests (existente)

---

## Notes

- El schema.prisma necesita migración → requiere downtime de DB o usar --create-only
- American system típicamente tiene interés menor total vs French (menos "interés sobre interés")
- German tiene cuota inicial más alta (más principal al inicio)
- Considerar validación: American no disponible para términos > X meses (opcional, no en spec)