import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@prestamos.com' },
    update: {
      passwordHash: adminPassword
    },
    create: {
      email: 'admin@prestamos.com',
      passwordHash: adminPassword,
      role: Role.ADMIN,
      firstName: 'Admin',
      lastName: 'System',
      phone: '+1234567890',
    },
  });
  console.log('✅ Created admin user:', admin.email);

  // Create vendor user
  const vendorPassword = await bcrypt.hash('vendedor123', 10);
  const vendor = await prisma.user.upsert({
    where: { email: 'vendedor@prestamos.com' },
    update: {
      passwordHash: vendorPassword
    },
    create: {
      email: 'vendedor@prestamos.com',
      passwordHash: vendorPassword,
      role: Role.VENDEDOR,
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+1234567891',
    },
  });
  console.log('✅ Created vendor user:', vendor.email);

  // Create client user
  const clientPassword = await bcrypt.hash('cliente123', 10);
  const clientUser = await prisma.user.upsert({
    where: { email: 'cliente@prestamos.com' },
    update: {
      passwordHash: clientPassword
    },
    create: {
      email: 'cliente@prestamos.com',
      passwordHash: clientPassword,
      role: Role.CLIENTE,
      firstName: 'María',
      lastName: 'González',
      phone: '+1234567892',
    },
  });
  console.log('✅ Created client user:', clientUser.email);

  // Create client profile
  const client = await prisma.client.upsert({
    where: { userId: clientUser.id },
    update: {},
    create: {
      userId: clientUser.id,
      dni: '12345678A',
      dateOfBirth: new Date('1990-05-15'),
      address: 'Calle Principal 123',
      city: 'Madrid',
      occupation: 'Empleada',
      employer: 'Empresa SA',
      monthlyIncome: 2000.00,
    },
  });
  console.log('✅ Created client profile:', client.dni);

  // Create default settings
  const settings = [
    { key: 'MORA_RATE', value: '0.01', description: 'Tasa de interés por mora (diario)' },
    { key: 'MIN_LOAN_AMOUNT', value: '1000', description: 'Monto mínimo de préstamo' },
    { key: 'MAX_LOAN_AMOUNT', value: '2000000', description: 'Monto máximo de préstamo' },
    { key: 'DEFAULT_INTEREST_RATE', value: '0.15', description: 'Tasa de interés anual por defecto' },
    { key: 'DEFAULT_TERM_MONTHS', value: '12', description: 'Plazo por defecto en meses' },
    // Tasas base por frecuencia (mensual = 30 * 12 = 360% anual)
    { key: 'WEEKLY_BASE_RATE', value: '7.5', description: 'Tasa semanal base para calcular anual (ej: 7.5 * 52 semanas)' },
    { key: 'BIWEEKLY_BASE_RATE', value: '15', description: 'Tasa quincenal base para calcular anual (ej: 15 * 24 quincenas)' },
    { key: 'MONTHLY_BASE_RATE', value: '30', description: 'Tasa mensual base para calcular anual (ej: 30 * 12 meses)' },
    { key: 'DAILY_BASE_RATE', value: '1', description: 'Tasa diaria base para calcular anual (ej: 1 * 365 días)' },
    { key: 'ROUNDING_UNIT', value: '1000', description: 'Unidad mínima de redondeo para cálculos de moneda' },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: setting,
    });
  }
  console.log('✅ Created default settings');

  console.log('\n🎉 Seed completed successfully!');
  console.log('\n📝 Login credentials:');
  console.log('   Admin:    admin@prestamos.com / admin123');
  console.log('   Vendor:   vendedor@prestamos.com / vendedor123');
  console.log('   Client:   cliente@prestamos.com / cliente123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
