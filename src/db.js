const { PrismaClient } = require('@prisma/client');
const prisma = globalThis.paypointPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalThis.paypointPrisma = prisma;
module.exports = { prisma };
