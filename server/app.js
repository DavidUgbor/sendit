const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.json({ message: 'SendIT API is running' });
});

app.get('/health', async (req, res) => {
    try {
        const r = await pool.query('SELECT 1 AS ok');
        res.json({ db: 'up', result: r.rows[0] });
    } catch (e) {
        console.error('health db error:', e.code, e.message, e);
        res.status(500).json({ db: 'down', code: e.code, errno: e.errno, message: e.message, address: e.address, port: e.port });
    }
});

app.post('/api/v1/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const h = await bcrypt.hash(password, 10);
        const r = await pool.query('INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING id,name,email', [name, email, h]);
        const u = r.rows[0];
        const t = jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'User created', user: u, token: t });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: e.message, code: e.code });
    }
});

app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
        if (!r.rows.length) return res.status(401).json({ message: 'Invalid credentials' });
        const u = r.rows[0];
        const ok = await bcrypt.compare(password, u.password);
        if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
        const t = jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', user: { id: u.id, name: u.name, email: u.email }, token: t });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.post('/api/v1/parcels', async (req, res) => {
    try {
        const { userId, pickup, destination, weight, description } = req.body;
        const r = await pool.query('INSERT INTO parcels (user_id,pickup,destination,weight,description,location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [userId, pickup, destination, weight, description, pickup]);
        res.status(201).json({ message: 'Parcel created', parcel: r.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.get('/api/v1/parcels', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels');
        res.json({ parcels: r.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.get('/api/v1/parcels/:id', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ parcel: r.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.get('/api/v1/users/:userId/parcels', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE user_id=$1', [req.params.userId]);
        res.json({ parcels: r.rows });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/cancel', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        if (r.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot cancel' });
        const u = await pool.query('UPDATE parcels SET status=$1 WHERE id=$2 RETURNING *', ['Cancelled', req.params.id]);
        res.json({ message: 'Parcel cancelled', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/destination', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM parcels WHERE id=$1', [req.params.id]);
        if (!r.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        if (r.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot change destination' });
        const u = await pool.query('UPDATE parcels SET destination=$1 WHERE id=$2 RETURNING *', [req.body.destination, req.params.id]);
        res.json({ message: 'Destination updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/status', async (req, res) => {
    try {
        const u = await pool.query('UPDATE parcels SET status=$1 WHERE id=$2 RETURNING *', [req.body.status, req.params.id]);
        if (!u.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Status updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

app.put('/api/v1/parcels/:id/presentLocation', async (req, res) => {
    try {
        const u = await pool.query('UPDATE parcels SET location=$1 WHERE id=$2 RETURNING *', [req.body.location, req.params.id]);
        if (!u.rows.length) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Location updated', parcel: u.rows[0] });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: e.message, code: e.code });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('SendIT API running on port ' + PORT);
});