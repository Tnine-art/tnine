const { createApp } = require('../src/app');

// Vercel keeps the exported Express application as a serverless function.
// The normal local/Render server continues to use src/server.js.
module.exports = createApp();
