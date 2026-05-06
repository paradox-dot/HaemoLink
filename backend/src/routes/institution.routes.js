const express = require('express');
const router = express.Router();
const controller = require('../controllers/institution.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

router.post('/', verifyToken, requireRole('System Admin'), controller.createInstitution);
router.get('/', verifyToken, controller.getInstitutions);
router.get('/:institution_id', verifyToken, controller.getInstitutionById);
router.put('/:institution_id/status', verifyToken, requireRole('System Admin'), controller.updateInstitutionStatus);

module.exports = router;
