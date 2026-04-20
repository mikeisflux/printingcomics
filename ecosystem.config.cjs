// pm2 process definition for printingcomics.
//
//   pm2 start ecosystem.config.cjs       # first time
//   pm2 reload printingcomics            # after a rebuild
//   pm2 logs printingcomics              # tail output
//   pm2 save && pm2 startup              # persist across reboots

module.exports = {
  apps: [
    {
      name: 'printingcomics',
      cwd: '/opt/printingcomics/server',
      script: 'dist/index.js',
      // Node --env-file loads /opt/printingcomics/.env (one dir up from cwd).
      node_args: ['--env-file=../.env'],
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
      out_file: '/var/log/printingcomics/out.log',
      error_file: '/var/log/printingcomics/err.log',
      merge_logs: true,
    },
  ],
};
