const router = require('express').Router();
const { verifyToken } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/notification.controller');

router.use(verifyToken);

router.get('/summary', ctrl.getDashboardSummary);
router.get('/count', ctrl.getUnreadCount);
router.get('/', ctrl.getNotifications);
router.put('/read-all', ctrl.markAllRead);
router.put('/:id/read', ctrl.markRead);

module.exports = router;
