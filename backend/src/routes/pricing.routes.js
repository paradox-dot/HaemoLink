const express = require('express');
const router = express.Router();
const controller = require('../controllers/pricing.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

router.get('/defaults', verifyToken, controller.getDefaults);
router.get('/institutions', verifyToken, requireRole('System Admin'), controller.getBloodBankInstitutions);
router.get('/:institution_id', verifyToken, controller.getPricing);
router.put('/:institution_id', verifyToken,
  requireRole('Institutional Admin', 'System Admin'),
  controller.upsertPricing);

module.exports = router;
