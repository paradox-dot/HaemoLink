const express = require('express');
const router = express.Router();
const controller = require('../controllers/receivedStock.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

const allowed = ['System Admin', 'Institutional Admin', 'Transfusion Officer'];

router.get('/', verifyToken, requireRole(...allowed), controller.getReceivedStock);
router.put('/:id/status', verifyToken, requireRole(...allowed), controller.updateReceivedStockStatus);

module.exports = router;
