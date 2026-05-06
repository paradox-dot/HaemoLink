# 🩸 HaemoLink

**Blood Bank Network Management Platform**

HaemoLink connects blood banks and hospitals across a city network to reduce blood wastage, improve emergency fulfillment, and streamline inter-institutional blood transfers. It features an intelligent matching engine that pairs demand requests with available inventory across the network in real time.

> Created by **Arka Bandyopadhyay** (School of Management, IIT Bombay '26)  

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Context API |
| Backend | Node.js, Express 5 |
| Database | PostgreSQL |
| Auth | JWT + Session management |
| Styling | CSS custom properties (light/dark theme) |

---

## Features

- 🩸 Blood inventory management with expiry tracking
- 📋 Demand request creation with priority scoring
- 🔗 Intelligent matching algorithm (compatibility, distance, urgency, expiry)
- 🚚 Inter-institutional transfer workflow (9-stage state machine)
- 💰 Per-institution pricing with payment gate before dispatch
- 📦 Received stock tracking
- 📤 CSV bulk import and export
- 🔔 Real-time notifications and expiry alerts
- 🌙 Dark mode
- ⌨️ Keyboard shortcuts
- 📜 Comprehensive audit trail
- 👥 Role-based access control (5 roles)

---

## User Roles

| Role | Description |
|------|-------------|
| System Admin | Full system access across all institutions |
| Institutional Admin | Manages own institution, users, and pricing |
| Blood Bank Ops Manager | Inventory, matching, and transfer operations |
| Transfusion Officer | Demand creation, match decisions, received stock |
| Hospital Administrator | View-only access to reports and demands |

---

## Project Structure

```
haemolink/
├── backend/
│   ├── src/
│   │   ├── config/         # DB connection, SQL migrations
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # JWT auth, role checks
│   │   ├── routes/         # Express routers
│   │   ├── services/       # Business logic (matching, expiry)
│   │   └── utils/          # CSV utility
│   ├── uploads/            # License document uploads
│   └── .env.example        # Environment variable template
└── frontend/
    ├── public/
    ├── src/
    │   ├── components/     # All UI components
    │   ├── context/        # Auth and Theme context
    │   ├── hooks/          # Keyboard shortcuts hook
    │   ├── pages/          # Login, Register, Dashboard
    │   └── services/       # API service (authFetch)
    └── .env.example        # Environment variable template
```

---

## Local Setup

### Prerequisites
- Node.js v18+
- PostgreSQL 14+

### 1. Clone the repository
```bash
git clone https://github.com/paradox-dot/HaemoLink.git
cd HaemoLink
```

### 2. Set up the backend
```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials and a strong JWT secret (see `.env.example` for all required variables).

### 3. Set up the database
```bash
# Create the database
psql -U postgres -c "CREATE DATABASE haemolink;"

# Run the schema
psql -U postgres -d haemolink -f src/config/init.sql

# Run migrations
psql -U postgres -d haemolink -f src/config/migration_pricing.sql
psql -U postgres -d haemolink -f src/config/migration_received_stock.sql

# (Optional) Seed sample data
node seed_sample_data.js
```

### 4. Set up the frontend
```bash
cd ../frontend
npm install
cp .env.example .env
```

Edit `.env` with your backend URL (see `.env.example`).

### 5. Run the application

In one terminal (backend):
```bash
cd backend
npm start
```

In another terminal (frontend):
```bash
cd frontend
npm start
```

Open **http://localhost:3000** in your browser.

---

## Default Credentials (after seeding)

After running `seed_sample_data.js`, a System Admin account is created with the credentials defined in your seed file.

> ⚠️ Change the default password immediately after first login in a production environment.

---

## API Overview

The backend runs on `http://localhost:5000`. All routes except `/auth/login` and `/auth/register` require a `Bearer` JWT token.

| Prefix | Description |
|--------|-------------|
| `/auth` | Login, logout, register, change password |
| `/inventory` | Blood inventory CRUD + bulk import |
| `/demand` | Demand requests |
| `/match` | Matching engine + accept/reject |
| `/transfer` | Transfer workflow |
| `/received-stock` | Received stock management |
| `/pricing` | Institution pricing configuration |
| `/notification` | Notifications + dashboard summary |
| `/user` | User management |
| `/institution` | Institution management |
| `/audit` | Audit trail |

---

## Documentation

- 📘 User Manual — End-user guide covering all features
- 🔧 System Manual — Technical documentation covering architecture, DB schema, and deployment

---

## License

This project was developed for academic purposes at IIT Bombay. All rights reserved.
