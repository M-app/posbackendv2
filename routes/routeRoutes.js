const express = require('express');
const router = express.Router();
const {
  getRoutes,
  createRoute,
  getRouteById,
  updateRoute,
  deleteRoute,
  updateRouteCustomers
} = require('../controllers/routeController');

router.get('/', getRoutes);
router.post('/', createRoute);
router.get('/:id', getRouteById);
router.put('/:id', updateRoute);
router.delete('/:id', deleteRoute);
router.put('/:id/customers', updateRouteCustomers);

module.exports = router;
