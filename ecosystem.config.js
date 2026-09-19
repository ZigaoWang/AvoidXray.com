/**
 * How pm2 runs this app.
 *
 * Written down because two things about the process are load-bearing and were
 * previously only true by accident of how somebody typed the start command.
 *
 * The app was started as `pm2 start npm -- run start`, which puts npm between
 * pm2 and the server. pm2 then supervises npm: `pm2 list` reported 79MB for
 * this app while the Next server under it held 1.3GB, and any memory limit set
 * on it would have watched a shell that never grows. Naming the Next binary
 * directly removes the middle process and makes what pm2 reports the thing that
 * is actually using the machine.
 *
 *   pm2 delete avoidxray
 *   pm2 start ecosystem.config.js
 *   pm2 save
 */

const os = require('node:os')

const cores =
  (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) || 1

/**
 * Kept in step with RENDER_SLOTS in src/lib/capacity.ts.
 *
 * Duplicated rather than imported because pm2 reads this file as plain
 * CommonJS, before any build step, and cannot load the TypeScript module. If
 * the formula there changes, change it here: the thread pool below is sized
 * from it, and a pool smaller than the slot count is a ceiling nothing reports.
 */
const renderSlots = Math.max(2, cores - 1)

module.exports = {
  apps: [
    {
      name: 'avoidxray',
      script: './node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,

      /**
       * Fork, never cluster, and exactly one of them.
       *
       * The render semaphore and the source cache in serverPipeline.ts are
       * process-local, as is the rate limiter in rateLimit.ts. Under cluster
       * mode each worker would keep its own copy: N times the memory ceiling
       * the semaphore exists to advertise, and a rate limit N times looser than
       * the one configured. Neither failure would show up as an error.
       */
      exec_mode: 'fork',
      instances: 1,

      env: {
        NODE_ENV: 'production',
        PORT: 3000,

        /**
         * libuv's thread pool, which is not the same pool as libvips'.
         *
         * sharp dispatches each operation onto a libuv thread, and that thread
         * then drives however many libvips threads sharp.concurrency allows. So
         * the pool bounds how many renders can be in flight at once, whatever
         * the semaphore admits, and it defaults to 4. Raising the render slots
         * without raising this would move the queue rather than remove it.
         *
         * Two above the slot count, because fs, dns and crypto draw on the same
         * pool and a render should not have to wait behind a file read.
         */
        UV_THREADPOOL_SIZE: String(Math.max(4, renderSlots + 2)),
      },

      /**
       * A backstop, not a tuning knob.
       *
       * A gallery print at full resolution peaks around 1.2GB, and glibc holds
       * freed arenas rather than returning them, so a resident size well above
       * the idle baseline is expected and healthy. This is set clear of that so
       * it fires on a genuine runaway and not on a large export, because the
       * restart it triggers drops whatever was being rendered at the time.
       */
      max_memory_restart: '3G',

      /**
       * Long enough for a render in flight to finish.
       *
       * The default is 1.6 seconds, which a full-resolution export does not
       * finish inside, so every deploy during one ended it with a truncated
       * download rather than a file.
       */
      kill_timeout: 10000,
    },
  ],
}
