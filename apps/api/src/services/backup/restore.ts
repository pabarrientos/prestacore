import { exec } from 'child_process';
import { promisify } from 'util';
import { stat } from 'fs/promises';

const execAsync = promisify(exec);

// RestorePreview interface - duplicated from @prestamos/shared to avoid import issues
interface RestorePreview {
  tables: Array<{ name: string; rowCount: number }>;
  totalTables: number;
  fileSizeBytes: number;
}

export interface TableMetadata {
  name: string;
  rowCount: number;
}

/**
 * Parse a PostgreSQL dump file to extract table names and approximate row counts
 * Uses regex to find COPY statements and wc -l to count rows
 */
export async function previewRestore(filepath: string): Promise<RestorePreview> {
  // Use pg_restore --list to get table list (works for custom format .dump)
  try {
    const { stdout } = await execAsync(`pg_restore --list "${filepath}" 2>/dev/null || echo ""`, {
      timeout: 30000,
    });

    // Parse pg_restore output for table names
    // Format: "NUMBER; OID SCHEMA_OID TYPE [DATA] SCHEMA TABLE_NAME OWNER"
    const tables: TableMetadata[] = [];
    const tableRegex = /^\d+;\s+\d+\s+\d+\s+TABLE(?:\s+DATA)?\s+(\S+)\s+(\S+)/gm;
    let match;

    while ((match = tableRegex.exec(stdout)) !== null) {
      const schema = match[1];
      const name = match[2];
      // Skip internal PostgreSQL objects, indexes, and constraints
      if (schema === 'public' && !name.startsWith('pg_') && !name.includes('_pkey') && !name.includes('_fkey') && !name.includes('_idx')) {
        // Only add each table once (TABLE DATA duplicates TABLE entries)
        if (!tables.find(t => t.name === name)) {
          tables.push({ name, rowCount: 0 });
        }
      }
    }

    // For row counts, restore dump to SQL text and count rows between COPY ... \.
    try {
      const { stdout: sqlOut } = await execAsync(
        `pg_restore -f - "${filepath}" 2>/dev/null`,
        { timeout: 60000, maxBuffer: 50 * 1024 * 1024 }
      );
      
      const lines = sqlOut.split('\n');
      let currentTable: string | null = null;
      let currentCount = 0;
      
      for (const line of lines) {
        // Detect COPY statement: COPY public."TableName" (...) FROM stdin;
        const copyMatch = line.match(/^COPY\s+(?:public\.)?"?(\w+)"?\s*\(/);
        if (copyMatch) {
          // Save previous table count
          if (currentTable) {
            const t = tables.find(tbl => tbl.name === currentTable);
            if (t) t.rowCount = currentCount;
          }
          currentTable = copyMatch[1];
          currentCount = 0;
          continue;
        }
        
        // End of data marker
        if (line.trim() === '\\.') {
          if (currentTable) {
            const t = tables.find(tbl => tbl.name === currentTable);
            if (t) t.rowCount = currentCount;
          }
          currentTable = null;
          currentCount = 0;
          continue;
        }
        
        // Count data rows (non-empty, non-comment lines inside COPY block)
        if (currentTable && line.trim() !== '' && !line.startsWith('--')) {
          currentCount++;
        }
      }
    } catch {
      // Row counts are optional — table list is already shown
    }

    // Get file size
    const stats = await stat(filepath);

    return {
      tables,
      totalTables: tables.length,
      fileSizeBytes: stats.size,
    };
  } catch (error) {
    // If pg_restore --list fails, try regex parsing for SQL files
    return parseSqlDumpForPreview(filepath);
  }
}

/**
 * Fallback: Parse SQL dump file directly with regex
 */
async function parseSqlDumpForPreview(filepath: string): Promise<RestorePreview> {
  const tables: TableMetadata[] = [];
  
  try {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filepath);
    
    if (filepath.endsWith('.sql') || filepath.endsWith('.dump')) {
      // For SQL dumps, parse COPY statements
      const data = await fs.readFile(filepath, { encoding: 'utf-8' });
      
      // Match COPY table_name (col1, col2, ...) FROM stdin;
      const copyRegex = /^COPY\s+(\S+)/gm;
      const seenTables = new Set<string>();
      let match;
      
      while ((match = copyRegex.exec(data)) !== null) {
        const tableName = match[1];
        if (!seenTables.has(tableName)) {
          seenTables.add(tableName);
          
          // Count rows in COPY section
          const tablePattern = new RegExp(
            `COPY\\s+${tableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^;]+;`,
            'gm'
          );
          const matches = data.match(tablePattern) || [];
          let rowCount = 0;
          
          for (const copyBlock of matches) {
            const lines = copyBlock.split('\n').length - 2;
            rowCount += Math.max(0, lines);
          }
          
          tables.push({ name: tableName, rowCount });
        }
      }
    }
    
    return {
      tables,
      totalTables: tables.length,
      fileSizeBytes: stats.size,
    };
  } catch (error) {
    throw new Error(`Failed to parse backup file: ${error}`);
  }
}

/**
 * Validate if a file is a valid PostgreSQL backup
 */
export async function validateBackupFile(filepath: string): Promise<boolean> {
  try {
    // Try pg_restore --help as a quick check if pg tools are available
    await execAsync('which pg_restore', { timeout: 5000 });
    
    // Try pg_restore --list on the file
    const result = await execAsync(`pg_restore --list "${filepath}" 2>/dev/null || echo "error"`, {
      timeout: 10000,
    });
    
    // Check if output contains error indicator
    return !result.stdout.includes('error');
  } catch {
    // Fallback: check file extension
    return filepath.endsWith('.sql') || filepath.endsWith('.dump') || filepath.endsWith('.tar');
  }
}