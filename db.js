// db.js
const { Pool } = require('pg')

// En serverless (Vercel) cada invocación crea un proceso de corta vida y
// debe usar el "transaction pooler" de Supabase (pgbouncer en :6543) con un
// pool muy pequeño. En servidor tradicional usamos la conexión directa
// (sesión, :5432), que soporta features que pgbouncer no permite.
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

const rawConnectionString = isServerless
  ? (process.env.DATABASE_URL ||
     process.env.POSTGRES_URL ||
     process.env.POSTGRES_PRISMA_URL ||
     process.env.POSTGRES_URL_NON_POOLING)
  : (process.env.DATABASE_URL ||
     process.env.POSTGRES_URL_NON_POOLING ||
     process.env.POSTGRES_URL)

// pg 8.x ignora `ssl: { rejectUnauthorized: false }` cuando la URL trae
// `sslmode=require`. Usamos `sslmode=no-verify` para aceptar el cert
// auto-firmado de Supabase sin desactivar TLS.
const connectionString = rawConnectionString
  ? rawConnectionString.replace(/sslmode=require/g, 'sslmode=no-verify')
  : rawConnectionString

const requiresSsl =
  process.env.POSTGRES_SSL !== 'false' ||
  /supabase\.(co|com)|sslmode=(require|no-verify)/.test(connectionString || '')

// En serverless reducimos el pool y los timeouts: cada lambda mantiene
// pocas conexiones y se reciclan rápido para no agotar Supabase.
const defaultMax = isServerless ? '1' : '20'
const defaultIdle = isServerless ? '10000' : '30000'
const defaultConnTimeout = isServerless ? '8000' : '5000'

const config = {
  connectionString,
  ssl: requiresSsl ? { rejectUnauthorized: false } : false,

  max: parseInt(process.env.PG_POOL_MAX || defaultMax, 10),
  idleTimeoutMillis: parseInt(process.env.PG_IDLE_MS || defaultIdle, 10),
  connectionTimeoutMillis: parseInt(process.env.PG_CONN_TIMEOUT_MS || defaultConnTimeout, 10),

  application_name: isServerless ? 'tienda-vercel' : 'tienda-local',
  keepAlive: !isServerless,
}

if (!connectionString) {
  console.warn('[pg] No DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL set in env')
}

// pgbouncer (transaction mode) no soporta `SET` de sesión; solo aplicamos
// statement_timeout en pools no-bouncer.
const usingPgBouncer = /pgbouncer=true|:6543\//.test(connectionString || '')

const installSessionTimeouts = (p) => {
  p.on('error', (err) => console.error('[pg] idle client error', err))
  if (usingPgBouncer) return
  p.on('connect', (client) => {
    client.query('SET statement_timeout = 4000')
    client.query('SET idle_in_transaction_session_timeout = 5000')
    client.query('SET lock_timeout = 2000')
  })
}

let pool

if (process.env.NODE_ENV !== 'production' && !isServerless) {
  if (!global.__PG_POOL__) {
    global.__PG_POOL__ = new Pool(config)
    installSessionTimeouts(global.__PG_POOL__)
  }
  pool = global.__PG_POOL__
} else if (isServerless) {
  // En serverless Vercel también cacheamos el pool entre invocaciones del
  // mismo container ("warm start") usando un global.
  if (!global.__PG_POOL__) {
    global.__PG_POOL__ = new Pool(config)
    installSessionTimeouts(global.__PG_POOL__)
  }
  pool = global.__PG_POOL__
} else {
  pool = new Pool(config)
  installSessionTimeouts(pool)
}

module.exports = { pool }
