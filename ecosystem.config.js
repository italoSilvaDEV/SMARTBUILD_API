// module.exports = {
//     apps: [
//       {
//         name: "api-smartbuild",
//         script: "npm",
//         args: "start",
//         port: 4003,
//         watch: true
//       }
//     ]
//   };
  

module.exports = {
  apps: [
    {
      name: "api-smartbuild",
      script: "dist/src/server.js",
      env: {
        NODE_ENV: "production",
        REDIS_URL: "redis://127.0.0.1:6379"
      },
      watch: false
    },
    {
      name: "worker-smartbuild",
      script: "dist/worker/quickbooksWorker.js",
      env: {
        NODE_ENV: "production",
        REDIS_URL: "redis://127.0.0.1:6379"
      },
      watch: false
    }
  ]
}