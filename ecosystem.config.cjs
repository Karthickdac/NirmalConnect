// PM2 Ecosystem Config — People Connect
// Usage: pm2 start ecosystem.config.cjs
// Then:  pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: "people-connect-api",
      script: "./artifacts/api-server/dist/index.mjs",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      cwd: "/home/ctr/htdocs/ctr.tamilagavetrikalagam.com",
      env: {
        NODE_ENV: "production",
        PORT: "2500",
      },
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      // Logging
      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
