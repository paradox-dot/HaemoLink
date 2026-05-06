require('dotenv').config();
const express = require('express');
const cors = require('cors');

const pool = require('./config/db');

const authRoutes = require('./routes/auth.routes');
const institutionRoutes = require('./routes/institution.routes');
const userRoutes = require('./routes/user.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const demandRoutes = require('./routes/demand.routes');
const matchRoutes = require('./routes/match.routes');
const transferRoutes = require('./routes/transfer.routes');
const auditRoutes = require('./routes/audit.routes');
const notificationRoutes = require('./routes/notification.routes');
const receivedStockRoutes = require('./routes/receivedStock.routes');
const pricingRoutes = require('./routes/pricing.routes');
const { startExpiryMonitor } = require('./services/expiry.service');

const path = require('path');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

pool.connect()
  .then(() => console.log('DB Connected'))
  .catch(err => console.error('DB Connection Error', err));

app.get('/', (req, res) => {
  res.send('HaemoLink API Running');
});

app.use('/auth', authRoutes);
app.use('/institution', institutionRoutes);
app.use('/user', userRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/demand', demandRoutes);
app.use('/match', matchRoutes);
app.use('/transfer', transferRoutes);
app.use('/audit', auditRoutes);
app.use('/notification', notificationRoutes);
app.use('/received-stock', receivedStockRoutes);
app.use('/pricing', pricingRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startExpiryMonitor();
});
