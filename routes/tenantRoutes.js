const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middleware/adminAuth');
const {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantUsers,
  createTenantUser,
  getTenantStats
} = require('../controllers/tenantController');

// Usar middleware especial para admin
router.use(adminAuthMiddleware);

// Rutas CRUD para tenants
router.get('/', getAllTenants);
router.get('/:id', getTenantById);
router.post('/', createTenant);
router.put('/:id', updateTenant);
router.delete('/:id', deleteTenant);

// Rutas adicionales para gestión de tenants
router.get('/:id/users', getTenantUsers);
router.post('/:id/users', createTenantUser);
router.get('/:id/stats', getTenantStats);

module.exports = router;
