const { createApp } = require('./app');
const { config } = require('./config');
const { prisma } = require('./db');

const server = createApp().listen(config.port, () => console.log(`PayPoint running at ${config.appUrl}`));
async function shutdown(signal) {
  console.log(`${signal} received; shutting down.`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
