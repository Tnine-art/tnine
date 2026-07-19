const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../src/lib/security');
require('dotenv').config();
const prisma = new PrismaClient();

(async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Set a valid ADMIN_EMAIL environment variable.');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'ADMIN', passwordHash },
    create: { name: 'PayPoint Administrator', email, passwordHash, role: 'ADMIN', account: { create: { type: 'USER_WALLET', name: 'Administrator wallet' } } }
  });
  console.log(`Administrator ready: ${user.email}`);
})().finally(() => prisma.$disconnect());
