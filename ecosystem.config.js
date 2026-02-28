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
      min_uptime: '10s',
      max_restarts: 1000,
      restart_delay: 3000,
      exp_backoff_restart_delay: 2000,
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Memory safety
      max_memory_restart: '900M',
      node_args: '--max-old-space-size=768',
      wait_ready: false,

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

        // OTP controls (dev)
        OTP_RATE_LIMIT_WINDOW_MINUTES: 10,
        OTP_RATE_LIMIT_MAX_REQUESTS: 10,
        OTP_IP_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
        OTP_IP_RATE_LIMIT_MAX_REQUESTS: 100,
        OTP_VERIFY_IP_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
        OTP_VERIFY_IP_RATE_LIMIT_MAX_REQUESTS: 250,
        RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
        RATE_LIMIT_MAX_REQUESTS: 500,

        TRUST_PROXY: 'true',
        MONGODB_CONNECT_RETRY_DELAY_MS: 5000,
        MONGODB_CONNECT_MAX_RETRIES: 0,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_RATE_LIMIT_STRICT: 'false',
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

        // OTP controls (prod)
        OTP_RATE_LIMIT_WINDOW_MINUTES: 10,
        OTP_RATE_LIMIT_MAX_REQUESTS: 10,
        OTP_IP_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
        OTP_IP_RATE_LIMIT_MAX_REQUESTS: 100,
        OTP_VERIFY_IP_RATE_LIMIT_WINDOW_MS: 10 * 60 * 1000,
        OTP_VERIFY_IP_RATE_LIMIT_MAX_REQUESTS: 250,
        RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
        RATE_LIMIT_MAX_REQUESTS: 500,

        TRUST_PROXY: 'true',
        MONGODB_CONNECT_RETRY_DELAY_MS: 5000,
        MONGODB_CONNECT_MAX_RETRIES: 0,

        USER_LOCATION_MIN_INTERVAL_MS: 4000,
        USER_LOCATION_RATE_LIMIT_STRICT: 'false',
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
