const express = require('express');
const router = express.Router();
const {
  getUsers,
  inviteUser,
  deleteUser
} = require('../controllers/userController');

router.get('/', getUsers);
router.post('/invite', inviteUser);
router.delete('/:id', deleteUser);

module.exports = router;
