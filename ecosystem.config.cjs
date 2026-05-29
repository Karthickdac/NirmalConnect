// PM2 Ecosystem Config — Nirmal Connect
// Usage: pm2 start ecosystem.config.cjs
// Then:  pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: "nirmal-connect-api",
      script: "./artifacts/api-server/dist/index.mjs",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      cwd: "/home/ctrnirmalconnect/htdocs/www.ctrnirmalconnect.com",
      env: {
        NODE_ENV: "production",
        PORT: "5005",
        DATABASE_URL: "postgresql://ctrnirmal:CHANGE_PASSWORD@localhost:5432/nirmalconnect",
        JWT_SECRET: "CHANGE_THIS_JWT_SECRET",
        SESSION_SECRET: "CHANGE_THIS_SESSION_SECRET",
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      out_file: "./logs/api-out.log",
      error_file: "./logs/api-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      merge_logs: true,
    },
  ],
};
