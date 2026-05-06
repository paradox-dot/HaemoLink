const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/audit.controller');

// All audit routes require auth + admin role
router.use(verifyToken);
router.use(requireRole('System Admin', 'Institutional Admin'));

router.get('/logs', ctrl.getAuditLogs);
router.get('/inventory-transitions', ctrl.getInventoryTransitions);
router.get('/demand-transitions', ctrl.getDemandTransitions);
router.get('/transfer-transitions', ctrl.getTransferTransitions);
router.get('/ownership-history', ctrl.getOwnershipHistory);

module.exports = router;
