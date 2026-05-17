const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(bodyParser.json());

// TEST ROUTE
app.get('/', (req, res) => {
    res.json({ message: 'SendIT API is running' });
});

// REGISTER USER
app.post('/api/v1/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
            [name, email, hashedPassword]
        );
        const user = result.rows[0];
        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ message: 'User created', user, token });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// LOGIN USER
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: 'Login successful', user: { id: user.id, name: user.name, email: user.email }, token });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CREATE PARCEL
app.post('/api/v1/parcels', async (req, res) => {
    try {
        const { userId, pickup, destination, weight, description } = req.body;
        const result = await pool.query(
            'INSERT INTO parcels (user_id, pickup, destination, weight, description, location) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, pickup, destination, weight, description, pickup]
        );
        res.status(201).json({ message: 'Parcel created', parcel: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET ALL PARCELS
app.get('/api/v1/parcels', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parcels');
        res.json({ parcels: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET ONE PARCEL
app.get('/api/v1/parcels/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parcels WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ parcel: result.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET PARCELS BY USER
app.get('/api/v1/users/:userId/parcels', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parcels WHERE user_id = $1', [req.params.userId]);
        res.json({ parcels: result.rows });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CANCEL PARCEL
app.put('/api/v1/parcels/:id/cancel', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parcels WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Parcel not found' });
        if (result.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot cancel a delivered parcel' });
        const updated = await pool.query('UPDATE parcels SET status = $1 WHERE id = $2 RETURNING *', ['Cancelled', req.params.id]);
        res.json({ message: 'Parcel cancelled', parcel: updated.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// CHANGE DESTINATION
app.put('/api/v1/parcels/:id/destination', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM parcels WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Parcel not found' });
        if (result.rows[0].status === 'Delivered') return res.status(400).json({ message: 'Cannot change destination of delivered parcel' });
        const updated = await pool.query('UPDATE parcels SET destination = $1 WHERE id = $2 RETURNING *', [req.body.destination, req.params.id]);
        res.json({ message: 'Destination updated', parcel: updated.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ADMIN - CHANGE STATUS
app.put('/api/v1/parcels/:id/status', async (req, res) => {
    try {
        const updated = await pool.query('UPDATE parcels SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, req.params.id]);
        if (updated.rows.length === 0) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Status updated', parcel: updated.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ADMIN - CHANGE LOCATION
app.put('/api/v1/parcels/:id/presentLocation', async (req, res) => {
    try {
        const updated = await pool.query('UPDATE parcels SET location = $1 WHERE id = $2 RETURNING *', [req.body.location, req.params.id]);
        if (updated.rows.length === 0) return res.status(404).json({ message: 'Parcel not found' });
        res.json({ message: 'Location updated', parcel: updated.rows[0] });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SendIT API running on port ${PORT}`);
});