const express = require('express');
const router = express.Router();
const {
  getBusinessConfig,
  updateBusinessConfig
} = require('../controllers/businessConfigController');

router.get('/', getBusinessConfig);
router.put('/', updateBusinessConfig); // Usamos PUT porque es una actualización completa del recurso singleton

module.exports = router;
