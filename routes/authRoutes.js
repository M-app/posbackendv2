const express = require('express');
const router = express.Router();
const { signUp, signIn, refreshSession, signOut } = require('../controllers/authController');

router.post('/signup', signUp);
router.post('/signin', signIn);
router.post('/refresh', refreshSession);
router.post('/signout', signOut);

module.exports = router;
