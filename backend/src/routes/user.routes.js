const express = require('express');
const router = express.Router();
const controller = require('../controllers/user.controller');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');

router.post('/', verifyToken, requireRole('System Admin', 'Institutional Admin'), controller.createUser);
router.get('/', verifyToken, requireRole('System Admin', 'Institutional Admin'), controller.getUsers);
router.get('/roles', verifyToken, controller.getRoles);
router.get('/:user_id', verifyToken, controller.getUserById);
router.put('/:user_id/status', verifyToken, requireRole('System Admin', 'Institutional Admin'), controller.updateUserStatus);
router.put('/:user_id/role', verifyToken, requireRole('System Admin'), controller.updateUserRole);
router.put('/:user_id/name', verifyToken, requireRole('System Admin'), controller.updateUserName);

module.exports = router;
