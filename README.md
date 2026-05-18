# SendIT

[![CI](https://github.com/DavidUgbor/sendit/actions/workflows/ci.yml/badge.svg)](https://github.com/DavidUgbor/sendit/actions/workflows/ci.yml)

A courier service that helps users deliver parcels to different destinations. SendIT provides courier quotes based on weight categories.

Andela Developer Challenge — "Build A Product: SendIT".

## Live

- **API**: https://sendit-api.onrender.com
- **Health check**: https://sendit-api.onrender.com/health
- **UI (GitHub Pages)**: https://davidugbor.github.io/sendit/

## Features

- Users can sign up and log in (JWT auth).
- Users can create, view, and cancel parcel delivery orders.
- Users can change the destination of an undelivered parcel.
- Admins can change the status and present location of a parcel.

## Stack

- **Backend**: Node.js, Express
- **Database**: PostgreSQL (Supabase)
- **Auth**: JSON Web Tokens (`jsonwebtoken`) + `bcryptjs`
- **Frontend**: HTML, CSS, vanilla JavaScript (no frameworks)
- **Hosting**: API on Render, UI on GitHub Pages

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Service banner |
| GET | `/health` | DB connectivity probe |
| POST | `/api/v1/auth/signup` | Register a new user |
| POST | `/api/v1/auth/login` | Log in, returns JWT |
| POST | `/api/v1/parcels` | Create a parcel delivery order |
| GET | `/api/v1/parcels` | List all parcels |
| GET | `/api/v1/parcels/:id` | Get one parcel |
| GET | `/api/v1/users/:userId/parcels` | List parcels for a user |
| PUT | `/api/v1/parcels/:id/cancel` | Cancel a parcel |
| PUT | `/api/v1/parcels/:id/destination` | Change destination |
| PUT | `/api/v1/parcels/:id/status` | Admin: update status |
| PUT | `/api/v1/parcels/:id/presentLocation` | Admin: update location |

## Local setup

```bash
git clone https://github.com/DavidUgbor/sendit.git
cd sendit/server
npm install
```

Create a `.env` file in `server/`:

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=any_long_random_string
```

Create the tables (use `psql` or the Supabase SQL editor):

```bash
psql "$DATABASE_URL" -f schema.sql
```

Run it:

```bash
npm start
```

## Deploying to Render

1. New **Web Service** from this repo.
2. **Root Directory**: `server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. **Environment variables** (names are case-sensitive — use underscores, not dashes):
   - `DATABASE_URL` — Supabase **Session pooler** URI (port 5432, host `aws-0-<region>.pooler.supabase.com`, user `postgres.<projectref>`). Direct connection won't work because Render is IPv4-only and Supabase's direct host is IPv6-only on the free tier.
   - `JWT_SECRET`
   - `NODE_ENV=production`

## Repository layout

```
.
├── index.html          # Landing page (served by GitHub Pages)
├── ui/                 # HTML/CSS/JS templates (Challenge 1)
│   ├── signup.html
│   ├── login.html
│   ├── dashboard.html
│   ├── order.html
│   └── admin.html
├── server/             # Express API (Challenges 2 + 3)
│   ├── app.js
│   ├── db.js
│   ├── schema.sql
│   └── package.json
└── README.md
```
