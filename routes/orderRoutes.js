const express = require('express');
const router = express.Router();
const { createOrder, getOrders, getOrderById, checkout } = require('../controllers/orderController');
const { getOrdersStats } = require('../controllers/orderController');
// const authMiddleware = require('../middleware/authMiddleware');

// router.use(authMiddleware); // Proteger todas las rutas de órdenes

router.post('/checkout', checkout);
router.get('/', getOrders);
router.get('/stats/summary', getOrdersStats);
router.post('/', createOrder); // Esta podría ser para crear órdenes en estado 'draft'
router.get('/:id', getOrderById);
router.put('/:id', require('../controllers/orderController').updateOrder);
router.delete('/:id', require('../controllers/orderController').deleteOrder);


module.exports = router;
