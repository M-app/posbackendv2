const { createClient } = require('@supabase/supabase-js');

// Este cliente usa la SERVICE_ROLE_KEY para operaciones con privilegios de administrador
// ¡¡NO EXPONER ESTA CLAVE EN EL LADO DEL CLIENTE!!
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabaseAdmin;
