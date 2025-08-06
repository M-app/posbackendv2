const express = require('express');
const router = express.Router();
const {
    getInventoryRecords,
    getInventoryRecordById,
    createInventoryRecord,
    updateInventoryRecord,
    deleteInventoryRecord,
    getProductMovements
} = require('../controllers/inventoryController');

router.get('/records', getInventoryRecords);
router.post('/records', createInventoryRecord);
router.get('/records/:id', getInventoryRecordById);
router.put('/records/:id', updateInventoryRecord);
router.delete('/records/:id', deleteInventoryRecord);
router.get('/movements/:productId', getProductMovements);


module.exports = router;
