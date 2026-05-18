const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ── Swagger setup ─────────────────────────────────────────────
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SendIT API',
      version: '1.0.0',
      description: 'Courier service API — create and manage parcel delivery orders',
    },
    servers: [{ url: 'https://sendit.hostless.app' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Parcel: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            user_id: { type: 'integer', example: 3 },
            pickup: { type: 'string', example: '12 Lagos Street, Abuja' },
            destination: { type: 'string', example: '7 Victoria Island, Lagos' },
            weight: { type: 'string', example: '2kg' },
            description: { type: 'string', example: 'Books and documents' },
            status: { type: 'string', example: 'In Transit' },
            location: { type: 'string', example: '12 Lagos Street, Abuja' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'David Ugbor' },
            email: { type: 'string', example: 'david@example.com' },
            is_admin: { type: 'boolean', example: false },
          },
        },
      },
    },
  },
  apis: ['./app.js'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Middleware ─────────────────────────────────────────────────

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

// ── Public routes ──────────────────────────────────────────────

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health check — confirms the API is running
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: SendIT API is running }
 */
app.get('/', (req, res) => {
  res.json({ message: 'SendIT API is running' });
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Database connectivity check
 *     responses:
 *       200:
 *         description: Database is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 db: { type: string, example: up }
 *       500:
 *         description: Database is down
 */
app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT 1 AS ok');
    res.json({ db: 'up', result: r.rows[0] });
  } catch (e) {
    console.error('health db error:', e.code, e.message, e);
    res.status(500).json({ db: 'down', code: e.code, message: e.message });
  }
});

/**
 * @swagger
 * /api/v1/auth/signup:
 *   post:
 *     summary: Register a new user account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: David Ugbor }
 *               email: { type: string, example: david@example.com }
 *               password: { type: string, example: secret123 }
 *     responses:
 *       201:
 *         description: User registered — returns token + user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: User created }
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Missing fields or email already taken
 */
app.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    const h = await bcrypt.hash(password, 10);
    const r = await pool.query(
      'INSERT INTO users (name,email,password) VALUES ($1,$2,$3) RETURNING id,name,email',
      [name, email, h],
    );
    const u = r.rows[0];
    const token = jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'User created', user: u, token });
  } catch (e) {
    console.error(e);
    res.status(400).json({ message: e.message, code: e.code });
  }
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in and receive a JWT token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: david@example.com }
 *               password: { type: string, example: secret123 }
 *     responses:
 *       200:
 *         description: Login successful — returns token + user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Login successful }
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Wrong email or password
 */
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

// ── Authenticated user routes ──────────────────────────────────

/**
 * @swagger
 * /api/v1/parcels:
 *   post:
 *     summary: Create a new parcel delivery order
 *     tags: [Parcels]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pickup, destination, weight]
 *             properties:
 *               pickup: { type: string, example: 12 Lagos Street Abuja }
 *               destination: { type: string, example: 7 Victoria Island Lagos }
 *               weight: { type: string, example: 2kg }
 *               description: { type: string, example: Books and documents }
 *     responses:
 *       201:
 *         description: Parcel created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Not authenticated
 */
app.post('/api/v1/parcels', verifyToken, async (req, res) => {
  try {
    const {
      pickup, destination, weight, description,
    } = req.body;
    if (!pickup || !destination || !weight) {
      return res.status(400).json({ message: 'pickup, destination and weight are required' });
    }
    const r = await pool.query(
      'INSERT INTO parcels (user_id,pickup,destination,weight,description,location) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.user.id, pickup, destination, weight, description, pickup],
    );
    res.status(201).json({ message: 'Parcel created', parcel: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message, code: e.code });
  }
});

/**
 * @swagger
 * /api/v1/users/{userId}/parcels:
 *   get:
 *     summary: Get all parcels belonging to a specific user
 *     tags: [Parcels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The user's ID
 *     responses:
 *       200:
 *         description: List of user's parcels
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 parcels:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Parcel' }
 *       401:
 *         description: Not authenticated
 */
app.get('/api/v1/users/:userId/parcels', verifyToken, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM parcels WHERE user_id=$1', [req.params.userId]);
    res.json({ parcels: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message, code: e.code });
  }
});

/**
 * @swagger
 * /api/v1/parcels/{id}:
 *   get:
 *     summary: Get a single parcel by ID
 *     tags: [Parcels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Parcel ID
 *     responses:
 *       200:
 *         description: Parcel details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       401:
 *         description: Not authenticated
 *       404:
 *         description: Parcel not found
 */
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

/**
 * @swagger
 * /api/v1/parcels/{id}/cancel:
 *   put:
 *     summary: Cancel a parcel order (owner only)
 *     tags: [Parcels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Parcel cancelled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Parcel cancelled }
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       400:
 *         description: Cannot cancel a delivered parcel
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: You can only cancel your own parcels
 *       404:
 *         description: Parcel not found
 */
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

/**
 * @swagger
 * /api/v1/parcels/{id}/destination:
 *   put:
 *     summary: Change destination of a parcel (owner only)
 *     tags: [Parcels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [destination]
 *             properties:
 *               destination: { type: string, example: 5 Broad Street Lagos }
 *     responses:
 *       200:
 *         description: Destination updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       400:
 *         description: Cannot change destination of a delivered parcel
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: You can only update your own parcels
 *       404:
 *         description: Parcel not found
 */
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

// ── Admin-only routes ──────────────────────────────────────────

/**
 * @swagger
 * /api/v1/parcels:
 *   get:
 *     summary: Get all parcel orders (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All parcels in the system
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 parcels:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Parcel' }
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 */
app.get('/api/v1/parcels', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM parcels');
    res.json({ parcels: r.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message, code: e.code });
  }
});

/**
 * @swagger
 * /api/v1/parcels/{id}/status:
 *   put:
 *     summary: Update the delivery status of a parcel (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [In Transit, Delivered, Cancelled]
 *                 example: Delivered
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       400:
 *         description: Status field missing
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Parcel not found
 */
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

/**
 * @swagger
 * /api/v1/parcels/{id}/presentLocation:
 *   put:
 *     summary: Update the current location of a parcel (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [location]
 *             properties:
 *               location: { type: string, example: Kaduna Junction Abuja }
 *     responses:
 *       200:
 *         description: Location updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 parcel: { $ref: '#/components/schemas/Parcel' }
 *       400:
 *         description: Location field missing
 *       401:
 *         description: Not authenticated
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Parcel not found
 */
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
