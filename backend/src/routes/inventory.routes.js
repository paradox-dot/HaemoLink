const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controllers/inventory.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.post('/', verifyToken, requireRole('Blood Bank Ops Manager'), controller.createInventory);
router.post('/bulk', verifyToken, requireRole('System Admin', 'Institutional Admin', 'Blood Bank Ops Manager'), upload.single('file'), controller.bulkCreateInventory);
router.get('/', verifyToken, controller.getInventory);
router.put('/:inventory_id/status', verifyToken, requireRole('Blood Bank Ops Manager'), controller.updateInventoryStatus);
router.put('/:inventory_id', verifyToken, requireRole('System Admin'), controller.editInventory);
router.delete('/:inventory_id', verifyToken, requireRole('System Admin', 'Institutional Admin', 'Blood Bank Ops Manager'), controller.deleteInventory);

module.exports = router;
