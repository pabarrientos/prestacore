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

# Función para listar todas las tablas del esquema public
list_all_tables() {
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename != '_prisma_migrations'
        ORDER BY tablename;
    " | tr -d ' '
}

# Función para contar registros en una tabla
count_rows() {
    local table_name=$1
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "
        SELECT COUNT(*) FROM \"$table_name\";
    " | tr -d ' '
}

# Cargar mapeo de migración → tabla(s) que crea
# Formato: migration_name:tabla1,tabla2,...
declare -A MIGRATION_TABLES=()

# Parsear todas las migraciones para extraer qué tablas crean
for migration_dir in packages/database/prisma/migrations/*/; do
    migration_name=$(basename "$migration_dir")
    sql_file="${migration_dir}migration.sql"
    if [ -f "$sql_file" ]; then
        # Extraer nombres de tablas de CREATE TABLE
        tables=$(grep -o 'CREATE TABLE "[^"]*"' "$sql_file" 2>/dev/null | \
                 sed 's/CREATE TABLE "\(.*\)"/\1/' | tr '\n' ',' | sed 's/,$//')
        if [ -n "$tables" ]; then
            MIGRATION_TABLES[$migration_name]=$tables
        fi
    fi
done

echo ""
echo "=== Tablas físicas vs migraciones registradas ==="

ANY_DRIFT=false
declare -A TABLES_TO_DROP=()

# Para cada tabla física, verificar si está cubierta por alguna migración registrada
while IFS= read -r table; do
    [ -z "$table" ] && continue

    # Buscar qué migración crea esta tabla
    migration=""
    for mig in "${!MIGRATION_TABLES[@]}"; do
        IFS=',' read -ra tbls <<< "${MIGRATION_TABLES[$mig]}"
        for t in "${tbls[@]}"; do
            if [ "$t" = "$table" ]; then
                migration=$mig
                break 2
            fi
        done
    done

    if [ -z "$migration" ]; then
        # No se encontró migración que cree esta tabla (podría ser del init)
        continue
    fi

    registered=$(check_migration_registered "$migration")
    rows=$(count_rows "$table")

    if [ "$registered" -gt 0 ]; then
        echo "✅ $table (migración: $migration) - sincronizada"
    else
        echo "⚠️  $table ($rows registros) - tabla existe pero migración NO registrada"
        TABLES_TO_DROP[$table]=$rows
        ANY_DRIFT=true
    fi
done < <(list_all_tables)

if [ "$ANY_DRIFT" = false ]; then
    echo ""
    echo "✅ Todas las tablas están sincronizadas con sus migraciones"
    exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Resolución de tablas desincronizadas"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Estas tablas existen físicamente pero Prisma no sabe que"
echo "fueron creadas (no están en _prisma_migrations)."
echo ""
echo "Para cada tabla, tenés dos opciones:"
echo "  [B] Borrar la tabla  → migrate deploy la recrea desde cero"
echo "                         ⚠️  ¡Se pierden los datos de esa tabla!"
echo "  [M] Marcar migración → preserva los datos, registra la migración"
echo "                         (seguro si la estructura coincide)"
echo ""
echo "Responde B (borrar) o M (marcar) para cada tabla:"
echo ""

for table in "${!TABLES_TO_DROP[@]}"; do
    rows=${TABLES_TO_DROP[$table]}

    # Encontrar la migración que crea esta tabla
    for mig in "${!MIGRATION_TABLES[@]}"; do
        IFS=',' read -ra tbls <<< "${MIGRATION_TABLES[$mig]}"
        for t in "${tbls[@]}"; do
            if [ "$t" = "$table" ]; then
                table_migration=$mig
                break 2
            fi
        done
    done

    echo ""
    echo "┌─────────────────────────────────────────────"
    echo "│ Tabla: $table"
    echo "│ Registros: $rows"
    echo "│ Migración: $table_migration"
    echo "└─────────────────────────────────────────────"

    while true; do
        read -r -p "¿Borrar (B) o Marcar (M)? [b/m]: " answer
        case "$answer" in
            [Bb])
                echo "   🗑️  Eliminando tabla $table..."
                docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "DROP TABLE IF EXISTS \"$table\" CASCADE;" > /dev/null 2>&1
                echo "   ✅ Tabla $table eliminada"
                break
                ;;
            [Mm])
                echo "   📝 Marcando migración $table_migration como aplicada..."
                npx prisma migrate resolve --applied "$table_migration" > /dev/null 2>&1 || true
                echo "   ✅ Migración marcada"
                break
                ;;
            *)
                echo "   ❌ Responde B o M"
                ;;
        esac
    done
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Sincronización completada"
echo ""
echo "Ahora podés ejecutar: pnpm -w db:migrate:deploy"
