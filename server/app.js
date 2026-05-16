const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// In-memory data store
let parcels = [];
let users = [];
let parcelId = 1;
let userId = 1;

// TEST ROUTE
app.get('/', (req, res) => {
    res.json({ message: 'SendIT API is running' });
});

// REGISTER USER
app.post('/api/v1/auth/signup', (req, res) => {
    const { name, email, password } = req.body;
    const existing = users.find(u => u.email === email);
    if (existing) return res.status(400).json({ message: 'User already exists' });
    const user = { id: userId++, name, email, password };
    users.push(user);
    res.status(201).json({ message: 'User created', user });
});

// LOGIN USER
app.post('/api/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    res.json({ message: 'Login successful', user });
});

// CREATE PARCEL
app.post('/api/v1/parcels', (req, res) => {
    const { userId, pickup, destination, weight, description } = req.body;
    const parcel = { id: parcelId++, userId, pickup, destination, weight, description, status: 'In Transit', location: pickup };
    parcels.push(parcel);
    res.status(201).json({ message: 'Parcel created', parcel });
});

// GET ALL PARCELS
app.get('/api/v1/parcels', (req, res) => {
    res.json({ parcels });
});

// GET ONE PARCEL
app.get('/api/v1/parcels/:id', (req, res) => {
    const parcel = parcels.find(p => p.id === parseInt(req.params.id));
    if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
    res.json({ parcel });
});

// GET PARCELS BY USER
app.get('/api/v1/users/:userId/parcels', (req, res) => {
    const userParcels = parcels.filter(p => p.userId === parseInt(req.params.userId));
    res.json({ parcels: userParcels });
});

// CANCEL PARCEL
app.put('/api/v1/parcels/:id/cancel', (req, res) => {
    const parcel = parcels.find(p => p.id === parseInt(req.params.id));
    if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
    if (parcel.status === 'Delivered') return res.status(400).json({ message: 'Cannot cancel a delivered parcel' });
    parcel.status = 'Cancelled';
    res.json({ message: 'Parcel cancelled', parcel });
});

// CHANGE DESTINATION
app.put('/api/v1/parcels/:id/destination', (req, res) => {
    const parcel = parcels.find(p => p.id === parseInt(req.params.id));
    if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
    if (parcel.status === 'Delivered') return res.status(400).json({ message: 'Cannot change destination of delivered parcel' });
    parcel.destination = req.body.destination;
    res.json({ message: 'Destination updated', parcel });
});

// ADMIN - CHANGE STATUS
app.put('/api/v1/parcels/:id/status', (req, res) => {
    const parcel = parcels.find(p => p.id === parseInt(req.params.id));
    if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
    parcel.status = req.body.status;
    res.json({ message: 'Status updated', parcel });
});

// ADMIN - CHANGE LOCATION
app.put('/api/v1/parcels/:id/presentLocation', (req, res) => {
    const parcel = parcels.find(p => p.id === parseInt(req.params.id));
    if (!parcel) return res.status(404).json({ message: 'Parcel not found' });
    parcel.location = req.body.location;
    res.json({ message: 'Location updated', parcel });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`SendIT API running on port ${PORT}`);
});