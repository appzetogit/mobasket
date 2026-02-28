module.exports = {
  apps: [
    {
      name: 'mo-basket-backend',
      cwd: './backend',
      script: 'server.js',

      exec_mode: process.env.PM2_EXEC_MODE || 'fork',
      instances: process.env.WEB_CONCURRENCY || 1,

      // Restart behavior
      autorestart: true,
      watch: false,
      min_uptime: '20s',
      max_restarts: 10,
      restart_delay: 5000,
      exp_backoff_restart_delay: 1000, // ✅ fixed
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Memory safety
      max_memory_restart: '600M',
      node_args: '--max-old-space-size=512', // ✅ added
      wait_ready: false, // ✅ added

      // Logs
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      time: true,

      // Default env
      env: {
        NODE_ENV: 'development',
        PORT: 5000,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_CLEANUP_INTERVAL_MS: 60000,
        USER_LOCATION_ENTRY_TTL_MS: 600000,
        USER_LOCATION_MAX_TRACKED_KEYS: 20000,

        LOG_USER_LOCATION_UPDATES: 'false',
        LOG_LOCATION_STREAM: 'false',
        LOG_LEVEL: process.env.LOG_LEVEL || 'info'
      },

      // Production env
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_CLEANUP_INTERVAL_MS: 60000,
        USER_LOCATION_ENTRY_TTL_MS: 600000,
        USER_LOCATION_MAX_TRACKED_KEYS: 20000,

        LOG_USER_LOCATION_UPDATES: 'false',
        LOG_LOCATION_STREAM: 'false',
        LOG_LEVEL: process.env.LOG_LEVEL || 'warn'
      }
    }
  ]
};