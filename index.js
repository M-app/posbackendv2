require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const supabase = require('./config/supabaseClient');
const { authMiddleware, requireRole } = require('./middleware/auth');

const app = express();

app.use(cors());
// Habilitar compresión para respuestas JSON/HTML/CSS/JS (umbral 1KB)
app.use(compression({ threshold: 1024 }));
app.use(express.json());

// Prueba de conexión a Supabase
app.get('/', (req, res) => {
  res.send('¡Backend de ControlPOS funcionando!');
});

// Rutas de la API
// app.use('/api/auth', require('./routes/authRoutes'));
// app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
// Rutas de tenants (con middleware especial)
app.use('/api/tenants', require('./routes/tenantRoutes'));
// Protegemos todo lo demás
app.use('/api', authMiddleware);
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/customers', require('./routes/customerRoutes'));
app.use('/api/routes', require('./routes/routeRoutes'));
app.use('/api/business', require('./routes/businessConfigRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
// app.use('/api/orders', require('./routes/orderRoutes'));
// ... etc

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
