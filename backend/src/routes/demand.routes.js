const express = require('express');
const router = express.Router();
const controller = require('../controllers/demand.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

router.post('/', verifyToken, requireRole('Transfusion Officer'), controller.createDemand);
router.get('/', verifyToken, controller.getDemand);
router.put('/:request_id/status', verifyToken, requireRole('Transfusion Officer'), controller.updateDemandStatus);
router.put('/:request_id/cancel', verifyToken, requireRole('System Admin', 'Institutional Admin', 'Transfusion Officer'), controller.cancelDemand);
router.put('/:request_id', verifyToken, requireRole('System Admin'), controller.editDemand);
router.delete('/:request_id', verifyToken, requireRole('System Admin', 'Institutional Admin', 'Transfusion Officer'), controller.deleteDemand);

module.exports = router;
