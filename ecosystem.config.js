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

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const util = require('node:util')

const cores =
  (typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length) || 1

/**
 * A variable from the shell, or else from .env.
 *
 * Next reads .env when the server starts, so an override put there reaches
 * capacity.ts but not this file, which pm2 evaluates in its own process. The
 * thread pool would then be sized for the derived slot count while the
 * semaphore admitted the configured one. Only the named variable is read: the
 * rest of .env is left for Next to load as it always has.
 */
function setting(name) {
  if (process.env[name] !== undefined) return process.env[name]
  try {
    return util.parseEnv(fs.readFileSync(path.join(__dirname, '.env'), 'utf8'))[name]
  } catch {
    return undefined
  }
}

/**
 * Kept in step with RENDER_SLOTS in src/lib/capacity.ts, override included.
 *
 * Duplicated rather than imported because pm2 reads this file as plain
 * CommonJS, before any build step, and cannot load the TypeScript module. If
 * the formula there changes, change it here: the thread pool below is sized
 * from it, and a pool smaller than the slot count is a ceiling nothing reports.
 * An unusable override falls back to the derived count, as it does there.
 */
const slotOverride = Number(setting('RENDER_SLOTS'))
const renderSlots = Math.max(2, Number.isInteger(slotOverride) && slotOverride >= 1 ? slotOverride : cores - 1)

module.exports = {
  apps: [
    {
      name: 'avoidxray',
      script: './node_modules/next/dist/bin/next',
      // Loopback only: nginx is the public face, and terminates TLS. Bound to
      // every interface, port 3000 answered the internet directly, past the
      // headers and the client IP nginx sets for the rate limiter.
      //
      // "localhost", not 127.0.0.1: Next treats a proxy rewrite as internal
      // only when its host matches the one Next was started with, and request
      // URLs read localhost. Started with 127.0.0.1, the rewrite to the
      // not-found page was fetched as an external URL and every missing page
      // answered 500. On this server localhost resolves to 127.0.0.1 alone.
      args: 'start -H localhost',
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
        // So capacity.ts admits exactly the slots the pool below was sized for.
        RENDER_SLOTS: String(renderSlots),

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

      // A crash at startup (the database down, a bad build) otherwise
      // restarts as fast as pm2 can spawn. Backoff starts at 100ms, doubles
      // to a 15s cap, and resets once the app has stayed up.
      exp_backoff_restart_delay: 100,
    },
    {
      /**
       * The vision worker (vision/worker.ts): screening new uploads, and
       * search and "More like this" for the site, on 127.0.0.1:3210.
       *
       * Its own process so its 2GB of models never sits on top of an export
       * render, and so either can crash or restart without the other. The site
       * works without it; uploads wait in the queue until it is back.
       */
      name: 'avoidxray-vision',
      // Node itself with tsx as a loader, not the tsx command: that one runs
      // the worker in a child process, so pm2 watched a 66MB launcher and the
      // memory limit below never saw the models.
      script: 'vision/worker.ts',
      interpreter: 'node',
      node_args: '--import tsx',
      cwd: __dirname,
      exec_mode: 'fork',
      instances: 1,
      env: {
        NODE_ENV: 'production',
        VISION_PORT: 3210,
        // A third of the cores, so a backfill never slows page renders.
        VISION_THREADS: String(Math.max(1, Math.floor(cores / 3))),
      },
      // Measured on the server: 1.5GB once the models load, 2.1GB once a few
      // photos have run. The text model is most of it; its multilingual
      // vocabulary is large. Well above that is a leak.
      max_memory_restart: '3G',
      // Each start loads 2GB of models, so a crash loop is expensive. The
      // worker already waits out a database outage itself; this covers
      // whatever else kills it.
      exp_backoff_restart_delay: 1000,
    },
  ],
}
