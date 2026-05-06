const express = require('express');
const router = express.Router();
const controller = require('../controllers/transfer.controller');
const pricingController = require('../controllers/pricing.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/', verifyToken, controller.createTransfer);
router.post('/:transfer_id/pay', verifyToken, pricingController.confirmPayment);
router.put('/:transfer_id', verifyToken, controller.updateTransferStatus);
router.get('/', verifyToken, controller.getTransfers);

module.exports = router;
