const express = require('express');
const router = express.Router();
const controller = require('../controllers/match.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

router.post('/run', verifyToken, requireRole('Blood Bank Ops Manager', 'System Admin'), controller.runMatchingEngine);
router.get('/', verifyToken, controller.getMatches);
router.put('/:match_id/accept', verifyToken, requireRole('Transfusion Officer'), controller.acceptMatch);
router.put('/:match_id/reject', verifyToken, requireRole('Transfusion Officer'), controller.rejectMatch);
router.delete('/:match_id', verifyToken, requireRole('System Admin'), controller.deleteMatch);

module.exports = router;
