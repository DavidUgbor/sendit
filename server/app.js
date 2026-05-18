const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ── Middleware ────────────────────────────────────────────────

function verifyToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
        next();
    } catch (e) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}

async function verifyAdmin(req, res, next) {
    try {
        const r = await pool.query('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
        if (!r.rows.length || !r.rows[0].is_admin) {
            return res.status(403).json({ message: 'Admin access required' });
        }
        next();
    } catch (e) {
        console.error(e);
        return res.status(500).json({ message: e.message });
    }
}

// ── Public routes ─────────────────────────────────────────────

app.get('/', (req, res) => {
    res.json({ message: 'SendIT API is running' });
});

app.get('/health', async (req, res) => {
    try {
        const r = await pool.query('SELECT 1 AS ok');
        res.json({ db: 'up', result: r.rows[0] });
    } catch (e) {
        console.error('health db error:', e.code, e.message, e);
        res.status(500).json({ db: 'down', code: e.code, message: e.message });
    }
});

app.post('/api/v1/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'name, email and password are required' });
        }
        const h = await bcrypt.hash(password, 10);
        const r = await pool.query(
            'INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING id,name,email',
            [name, email, h]
        );
        const u = r.rows[0];
        const token = jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'User created', user: u, token });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: e.message, code: e.code });
    }
});

app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'email and password are required' });
        }
        const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.status(401).json({ message: 'Invalid credentials' });
        const u = r.rows[0];
        const ok = await bcrypt.compare(password, u.password);
        if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', user: { id: u.id, name: u.name, email: u.email }, token });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

// ── Authenticated user routes ─────────────────────────────────

app.post('/api/v1/parcels', verifyToken, async (req, res) => {
    try {
        const { pickup, destination, weight, description } = req.body;
        if (!pickup || !destination || !weight) {
            return res.status(400).json({ message: 'pickup, destination and weight are required' });
        }
        const r = await pool.query(
            'INSERT INTO parcels (user_id,pickup,destination,weight,description,location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [req.user.id, pickup, destination, weight, description, pickup]
        );
        res.status(201).json({ message: 'Parcel created', parcel: r.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.get('/api/v1/users/:userId/parcels', verifyToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE user_id=$1', [req.params.userId]);
        res.json({ parcels: r.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.get('/api/v1/parcels/:id', verifyToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ parcel: r.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/cancel', verifyToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        if (r.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: 'You can only cancel your own parcels' });
        }
        if (r.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot cancel a delivered parcel' });
        const u = await pool.query('UPDATE parcels SET status=$1 WHERE id=$2 RETURNING *', ['Cancelled', req.params.id]);
        res.json({ message: 'Parcel cancelled', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/destination', verifyToken, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        if (r.rows[0].user_id !== req.user.id) {
            return res.status(403).json({ message: 'You can only update your own parcels' });
        }
        if (r.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot change destination of a delivered parcel' });
        const u = await pool.query('UPDATE parcels SET destination=$1 WHERE id=$2 RETURNING *', [req.body.destination, req.params.id]);
        res.json({ message: 'Destination updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

// ── Admin-only routes ─────────────────────────────────────────

app.get('/api/v1/parcels', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels');
        res.json({ parcels: r.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!req.body.status) return res.status(400).json({ message: 'status is required' });
        const u = await pool.query('UPDATE parcels SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
        if (!u.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Status updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/presentLocation', verifyToken, verifyAdmin, async (req, res) => {
    try {
        if (!req.body.location) return res.status(400).json({ message: 'location is required' });
        const u = await pool.query('UPDATE parcels SET location=$1 WHERE id=$2 RETURNING *', [req.body.location, req.params.id]);
        if (!u.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Location updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

module.exports = app;
