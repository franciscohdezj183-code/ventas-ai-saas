const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

module.exports = {
  apps: [
    {
      name: 'ventas-ai-api',
      cwd: backendDir,
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'ventas-ai-whatsapp-worker',
      cwd: backendDir,
      script: 'src/workers/whatsapp.worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      env: {
        NODE_ENV: 'production',
        HANDOFF_JOB_ENABLED: 'true'
      }
    }
  ]
};
