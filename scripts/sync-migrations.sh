#!/bin/bash
# Script para sincronizar migraciones después de restaurar backup
# Úsalo ANTES de ejecutar prisma migrate deploy en producción
#
# Uso: ./scripts/sync-migrations.sh

set -e

# Configuración de DB (ajustar según el entorno)
DB_HOST="${DB_HOST:-postgres}"
DB_USER="${DB_USER:-prestamos}"
DB_NAME="${DB_NAME:-prestamos}"
DB_CONTAINER="${DB_CONTAINER:-prestamos-db}"

echo "🔍 Verificando estado de migraciones..."
echo "   DB: $DB_HOST | Usuario: $DB_USER | Base: $DB_NAME"

# Función para verificar si una migración está registrada correctamente
check_migration_registered() {
    local migration_name=$1
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM _prisma_migrations
        WHERE migration_name = '$migration_name'
        AND finished_at IS NOT NULL;
    " | tr -d ' '
}

# Función para verificar si una tabla existe físicamente
check_table_exists() {
    local table_name=$1
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = '$table_name';
    " | tr -d ' '
}

# Función para verificar si una columna existe físicamente
check_column_exists() {
    local table_name=$1
    local column_name=$2
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = '$table_name'
        AND column_name = '$column_name';
    " | tr -d ' '
}

# Mapeo de migración → qué verificar (tabla y/o columna)
# Formato: migration_name:TABLA:tablename o migration_name:COLUMNA:tablename:columnname
declare -A MIGRATIONS_TO_CHECK=(
    ["20260602215806_add_interest_collected_to_installment"]="COLUMNA Installment interestCollected"
    ["20260605215145_add_backup_execution_log"]="TABLA BackupExecutionLog"
)

declare -A MIGRATION_ACTIONS=()
ANY_ISSUES=false

echo ""
echo "=== Estado actual ==="

for migration in "${!MIGRATIONS_TO_CHECK[@]}"; do
    read -r type param1 param2 <<< "${MIGRATIONS_TO_CHECK[$migration]}"

    migration_registered=$(check_migration_registered "$migration")

    if [ "$type" = "TABLA" ]; then
        table=$param1
        table_exists=$(check_table_exists "$table")

        if [ "$migration_registered" -eq 0 ] && [ "$table_exists" -gt 0 ]; then
            echo "⚠️  $migration: tabla '$table' existe pero migración NO registrada"
            MIGRATION_ACTIONS[$migration]="APPROVE"
            ANY_ISSUES=true
        elif [ "$migration_registered" -gt 0 ] && [ "$table_exists" -eq 0 ]; then
            echo "❌ $migration: migración registrada pero tabla '$table' NO existe"
            MIGRATION_ACTIONS[$migration]="APPLY_SQL"
            ANY_ISSUES=true
        elif [ "$migration_registered" -gt 0 ] && [ "$table_exists" -gt 0 ]; then
            echo "✅ $migration: tabla '$table' (sincronizada)"
        else
            echo "ℹ️  $migration: tabla '$table' (pendiente de aplicar)"
        fi

    elif [ "$type" = "COLUMNA" ]; then
        table=$param1
        column=$param2
        column_exists=$(check_column_exists "$table" "$column")

        if [ "$migration_registered" -eq 0 ] && [ "$column_exists" -gt 0 ]; then
            echo "⚠️  $migration: columna '$table.$column' existe pero migración NO registrada"
            MIGRATION_ACTIONS[$migration]="APPROVE"
            ANY_ISSUES=true
        elif [ "$migration_registered" -gt 0 ] && [ "$column_exists" -eq 0 ]; then
            echo "❌ $migration: migración registrada pero columna '$table.$column' NO existe"
            MIGRATION_ACTIONS[$migration]="APPLY_SQL"
            ANY_ISSUES=true
        elif [ "$migration_registered" -gt 0 ] && [ "$column_exists" -gt 0 ]; then
            echo "✅ $migration: columna '$table.$column' (sincronizada)"
        else
            echo "ℹ️  $migration: columna '$table.$column' (pendiente de aplicar)"
        fi
    fi
done

if [ "$ANY_ISSUES" = false ]; then
    echo ""
    echo "✅ Todas las migraciones están sincronizadas"
    echo ""
    echo "Podés ejecutar: pnpm --filter @prestamos/database run migrate deploy"
    exit 0
fi

echo ""
echo "🔧 Aplicando correcciones..."

for migration in "${!MIGRATION_ACTIONS[@]}"; do
    action=${MIGRATION_ACTIONS[$migration]}

    case $action in
        APPROVE)
            echo ""
            echo "📝 Marcando $migration como ya aplicada..."
            echo "   (la tabla/columna ya existe físicamente)"
            npx prisma migrate resolve --applied "$migration" 2>/dev/null || \
            docker exec -e DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:5432/$DB_NAME" \
                prestamos-api-dev sh -c "cd /app && npx prisma migrate resolve --applied $migration" 2>/dev/null || true
            echo "   ✅ Marcada como aplicada"
            ;;
        APPLY_SQL)
            echo ""
            echo "❌ ERROR: $migration"
            echo "   La migración está registrada pero la tabla/columna NO existe en la base de datos"
            echo ""
            echo "   Esto es un estado INCONSISTENTE. La migración se marcó como aplicada"
            echo "   pero nunca se ejecutó realmente."
            echo ""
            echo "   Solución:"
            echo "   1. Revisar el SQL de la migración en: packages/database/prisma/migrations/$migration/migration.sql"
            echo "   2. Ejecutar el SQL manualmente:"
            echo "      docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -f /tmp/sync-migration.sql"
            echo "   3. Volver a ejecutar este script"
            echo ""

            # Intentar aplicar el SQL directamente
            migration_file="packages/database/prisma/migrations/$migration/migration.sql"
            if [ -f "$migration_file" ]; then
                echo "   ¿Querés que intente aplicar la migración ahora? (s/n)"
                read -r answer
                if [ "$answer" = "s" ]; then
                    echo "   Ejecutando $migration_file..."
                    docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$migration_file"
                    echo "   ✅ Migración aplicada"
                fi
            fi
            ;;
    esac
done

echo ""
echo "✨ Sincronización completada"
echo ""
echo "Ahora podés ejecutar: pnpm --filter @prestamos/database run migrate deploy"
