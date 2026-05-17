const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});
pool.on('error', (err) => {
    console.error('pg pool error:', err.code, err.message, err);
});
pool.connect()
    .then(c => { console.log('pg connected'); c.release(); })
    .catch(err => console.error('pg connect failed:', err.code, err.message, err));
module.exports = pool;
