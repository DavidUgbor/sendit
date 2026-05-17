CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parcels (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    pickup VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    weight VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    status VARCHAR(50) DEFAULT 'In Transit',
    location VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);