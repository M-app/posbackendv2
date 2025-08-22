const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  inviteUser,
  deleteUser
} = require('../controllers/userController');
const { requireRole } = require('../middleware/auth')

router.get('/', requireRole('admin'), getUsers);
router.post('/', requireRole('admin'), createUser);
router.post('/invite', requireRole('admin'), inviteUser);
router.delete('/:id', requireRole('admin'), deleteUser);

module.exports = router;
