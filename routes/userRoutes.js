const express = require('express');
const router = express.Router();
const {
  getUsers,
  createUser,
  inviteUser,
  deleteUser
} = require('../controllers/userController');

router.get('/', getUsers);
router.post('/', createUser);
router.post('/invite', inviteUser);
router.delete('/:id', deleteUser);

module.exports = router;
