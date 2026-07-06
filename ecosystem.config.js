module.exports = {
  apps: [
    {
      // ─── Application Identity ────────────────────────────────────────────
      name: 'ibibina-backend',
      script: 'dist/main.js',

      // ─── Instances & Clustering ──────────────────────────────────────────
      instances: 1,           // Set to 'max' to use all CPU cores in cluster mode
      exec_mode: 'fork',      // Use 'cluster' when instances > 1

      // ─── Environment ─────────────────────────────────────────────────────
      env: {
        NODE_ENV: 'development',
        PORT: 5100,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5100,
      },

      // ─── Restart Behaviour ───────────────────────────────────────────────
      watch: false,                      // Never watch in production; use 'dist/' for dev
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',                  // Must stay up 5 s to count as a successful start
      restart_delay: 4000,               // Wait 4 s between crash restarts (ms)

      // ─── Memory Guard ────────────────────────────────────────────────────
      max_memory_restart: '512M',

      // ─── Logging ─────────────────────────────────────────────────────────
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,

      // ─── Process Control ─────────────────────────────────────────────────
      kill_timeout: 5000,                // Grace period before SIGKILL (ms)
      listen_timeout: 10000,             // Max time to wait for 'online' event (ms)
    },
  ],

  // ─── Deploy Configuration (optional, fill in your server details) ──────────
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['188.245.210.72'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/ibibina-system.git',
      path: '/var/www/ibibina/backend',
      'pre-deploy-local': '',
      'post-deploy':
        'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
