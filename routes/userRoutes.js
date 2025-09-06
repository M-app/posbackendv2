const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  inviteUser,
  deleteUser
} = require('../controllers/userController');
const { requireRole } = require('../middleware/auth')

router.get('/', requireRole('admin', 'super_admin'), getUsers);
router.post('/', requireRole('admin', 'super_admin'), createUser);
router.post('/invite', requireRole('admin', 'super_admin'), inviteUser);
router.delete('/:id', requireRole('admin', 'super_admin'), deleteUser);

module.exports = router;
