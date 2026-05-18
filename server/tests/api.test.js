require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { expect } = require('chai');
const app = require('../app');
const pool = require('../db');

// ── Test data ──────────────────────────────────────────────────
const testUser = {
    name: 'Test User',
    email: `test_${Date.now()}@example.com`,
    password: 'TestPass123'
};
const testAdmin = {
    name: 'Admin User',
    email: `admin_${Date.now()}@example.com`,
    password: 'AdminPass123'
};

let userToken = '';
let adminToken = '';
let userId = 0;
let parcelId = 0;

// ── Setup: create test users ───────────────────────────────────
before(async () => {
    // Create regular user via signup
    const res = await request(app)
        .post('/api/v1/auth/signup')
        .send(testUser);
    userToken = res.body.token;
    userId = res.body.user.id;

    // Create admin directly in DB and get a token for them
    const bcrypt = require('bcryptjs');
    const jwt = require('jsonwebtoken');
    const h = await bcrypt.hash(testAdmin.password, 10);
    const r = await pool.query(
        'INSERT INTO users (name,email,password,is_admin) VALUES ($1,$2,$3,true) RETURNING id,email',
        [testAdmin.name, testAdmin.email, h]
    );
    const admin = r.rows[0];
    adminToken = jwt.sign({ id: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    testAdmin.id = admin.id;
});

// ── Teardown: remove test data ─────────────────────────────────
after(async () => {
    await pool.query('DELETE FROM parcels WHERE user_id IN ($1,$2)', [userId, testAdmin.id]);
    await pool.query('DELETE FROM users WHERE id IN ($1,$2)', [userId, testAdmin.id]);
    await pool.end();
});

// ── GET / ──────────────────────────────────────────────────────
describe('GET /', () => {
    it('returns API running message', async () => {
        const res = await request(app).get('/');
        expect(res.status).to.equal(200);
        expect(res.body.message).to.include('SendIT');
    });
});

// ── GET /health ────────────────────────────────────────────────
describe('GET /health', () => {
    it('returns db up', async () => {
        const res = await request(app).get('/health');
        expect(res.status).to.equal(200);
        expect(res.body.db).to.equal('up');
    });
});

// ── POST /api/v1/auth/signup ───────────────────────────────────
describe('POST /api/v1/auth/signup', () => {
    it('creates a new user and returns a token', async () => {
        const res = await request(app)
            .post('/api/v1/auth/signup')
            .send({ name: 'New User', email: `new_${Date.now()}@x.com`, password: 'pass1234' });
        expect(res.status).to.equal(201);
        expect(res.body).to.have.property('token');
        expect(res.body.user).to.have.property('email');
        // Cleanup
        await pool.query('DELETE FROM users WHERE id=$1', [res.body.user.id]);
    });

    it('rejects duplicate email with 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/signup')
            .send(testUser);
        expect(res.status).to.equal(400);
    });

    it('rejects missing fields with 400', async () => {
        const res = await request(app)
            .post('/api/v1/auth/signup')
            .send({ email: 'no@name.com' });
        expect(res.status).to.equal(400);
    });
});

// ── POST /api/v1/auth/login ────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
    it('logs in with correct credentials', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: testUser.email, password: testUser.password });
        expect(res.status).to.equal(200);
        expect(res.body).to.have.property('token');
        expect(res.body.message).to.equal('Login successful');
    });

    it('rejects wrong password with 401', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: testUser.email, password: 'wrongpassword' });
        expect(res.status).to.equal(401);
    });

    it('rejects unknown email with 401', async () => {
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'nobody@x.com', password: 'pass' });
        expect(res.status).to.equal(401);
    });
});

// ── POST /api/v1/parcels ───────────────────────────────────────
describe('POST /api/v1/parcels', () => {
    it('creates a parcel for authenticated user', async () => {
        const res = await request(app)
            .post('/api/v1/parcels')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ pickup: 'Lagos', destination: 'Abuja', weight: '3kg', description: 'Books' });
        expect(res.status).to.equal(201);
        expect(res.body.parcel).to.have.property('id');
        expect(res.body.parcel.user_id).to.equal(userId);
        parcelId = res.body.parcel.id;
    });

    it('rejects unauthenticated request with 401', async () => {
        const res = await request(app)
            .post('/api/v1/parcels')
            .send({ pickup: 'Lagos', destination: 'Abuja', weight: '3kg' });
        expect(res.status).to.equal(401);
    });

    it('rejects missing required fields with 400', async () => {
        const res = await request(app)
            .post('/api/v1/parcels')
            .set('Authorization', `Bearer ${userToken}`)
            .send({ pickup: 'Lagos' });
        expect(res.status).to.equal(400);
    });
});

// ── GET /api/v1/parcels/:id ────────────────────────────────────
describe('GET /api/v1/parcels/:id', () => {
    it('returns a parcel for authenticated user', async () => {
        const res = await request(app)
            .get(`/api/v1/parcels/${parcelId}`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(200);
        expect(res.body.parcel.id).to.equal(parcelId);
    });

    it('returns 404 for non-existent parcel', async () => {
        const res = await request(app)
            .get('/api/v1/parcels/999999')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(404);
    });

    it('returns 401 without token', async () => {
        const res = await request(app).get(`/api/v1/parcels/${parcelId}`);
        expect(res.status).to.equal(401);
    });
});

// ── GET /api/v1/users/:userId/parcels ─────────────────────────
describe('GET /api/v1/users/:userId/parcels', () => {
    it('returns parcels for authenticated user', async () => {
        const res = await request(app)
            .get(`/api/v1/users/${userId}/parcels`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(200);
        expect(res.body.parcels).to.be.an('array');
    });
});

// ── PUT /api/v1/parcels/:id/destination ───────────────────────
describe('PUT /api/v1/parcels/:id/destination', () => {
    it('updates destination for parcel owner', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/destination`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ destination: 'Kano' });
        expect(res.status).to.equal(200);
        expect(res.body.parcel.destination).to.equal('Kano');
    });

    it('rejects unauthenticated request with 401', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/destination`)
            .send({ destination: 'Kano' });
        expect(res.status).to.equal(401);
    });
});

// ── PUT /api/v1/parcels/:id/cancel ────────────────────────────
describe('PUT /api/v1/parcels/:id/cancel', () => {
    it('cancels parcel for its owner', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/cancel`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(200);
        expect(res.body.parcel.status).to.equal('Cancelled');
    });

    it('cannot cancel an already-cancelled parcel (treated as delivered guard)', async () => {
        // Force status to Delivered to test that guard
        await pool.query("UPDATE parcels SET status='Delivered' WHERE id=$1", [parcelId]);
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/cancel`)
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(400);
    });
});

// ── Admin: GET /api/v1/parcels ─────────────────────────────────
describe('GET /api/v1/parcels (admin only)', () => {
    it('returns all parcels for admin', async () => {
        const res = await request(app)
            .get('/api/v1/parcels')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).to.equal(200);
        expect(res.body.parcels).to.be.an('array');
    });

    it('returns 403 for non-admin user', async () => {
        const res = await request(app)
            .get('/api/v1/parcels')
            .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).to.equal(403);
    });
});

// ── Admin: PUT status ──────────────────────────────────────────
describe('PUT /api/v1/parcels/:id/status (admin only)', () => {
    it('admin can update parcel status', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'In Transit' });
        expect(res.status).to.equal(200);
        expect(res.body.parcel.status).to.equal('In Transit');
    });

    it('returns 403 for non-admin', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/status`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ status: 'Delivered' });
        expect(res.status).to.equal(403);
    });
});

// ── Admin: PUT presentLocation ─────────────────────────────────
describe('PUT /api/v1/parcels/:id/presentLocation (admin only)', () => {
    it('admin can update parcel location', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/presentLocation`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ location: 'Port Harcourt' });
        expect(res.status).to.equal(200);
        expect(res.body.parcel.location).to.equal('Port Harcourt');
    });

    it('returns 403 for non-admin', async () => {
        const res = await request(app)
            .put(`/api/v1/parcels/${parcelId}/presentLocation`)
            .set('Authorization', `Bearer ${userToken}`)
            .send({ location: 'Ibadan' });
        expect(res.status).to.equal(403);
    });
});
