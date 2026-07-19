const { prisma } = require('../db');

async function audit({ actorId = null, action, entityType, entityId = null, metadata = null, ipAddress = null }) {
  return prisma.auditLog.create({ data: { actorId, action, entityType, entityId, metadata, ipAddress } });
}
module.exports = { audit };
