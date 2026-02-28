module.exports = {
  apps: [
    {
      name: 'mo-basket-backend',
      cwd: './backend',
      script: 'server.js',
      // Safe default for Socket.IO room consistency.
      // Switch to cluster only after sticky sessions + shared adapter (Redis) are configured.
      exec_mode: process.env.PM2_EXEC_MODE || 'fork',
      instances: process.env.WEB_CONCURRENCY || 1,

      // Graceful restart behavior
      autorestart: true,
      watch: false,
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 200,
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Prevent memory bloat from causing host instability
      max_memory_restart: '600M',

      // Keep one log stream per app and timestamp every line
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      time: true,

      // Environment defaults (safe fallback)
      env: {
        NODE_ENV: 'development',
        PORT: 5000,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_CLEANUP_INTERVAL_MS: 60000,
        USER_LOCATION_ENTRY_TTL_MS: 600000,
        USER_LOCATION_MAX_TRACKED_KEYS: 20000,

        LOG_USER_LOCATION_UPDATES: 'false',
        LOG_LOCATION_STREAM: 'false',
        LOG_LEVEL: 'info'
      },

      // Production overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_CLEANUP_INTERVAL_MS: 60000,
        USER_LOCATION_ENTRY_TTL_MS: 600000,
        USER_LOCATION_MAX_TRACKED_KEYS: 20000,

        LOG_USER_LOCATION_UPDATES: 'false',
        LOG_LOCATION_STREAM: 'false',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
