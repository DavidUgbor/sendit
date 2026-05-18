const { Pool } = require('pg');

const isLocal = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});
pool.on('error', (err) => {
  console.error('pg pool error:', err.code, err.message, err);
});
pool.connect()
  .then((c) => { console.log('pg connected'); c.release(); })
  .catch((err) => console.error('pg connect failed:', err.code, err.message, err));
module.exports = pool;
