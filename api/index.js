// Vercel Serverless Function entry point
// Mounts the Muhebrew Library backend on Vercel
process.env.VERCEL = process.env.VERCEL || '1';
const app = require('../backend/server.js');

module.exports = (req, res) => {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + req.url;
  }
  return app(req, res);
};
