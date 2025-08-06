require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: Variables de entorno de Supabase no encontradas.");
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

const usersToCreate = [
    {
        email: 'vendedor@test.com',
        password: 'vendedor123',
        user_metadata: { role: 'seller', tenant_id: tenantId }
    },
    {
        email: 'admin@test.com',
        password: 'admin123',
        user_metadata: { role: 'admin', tenant_id: tenantId }
    }
];

async function seedUsers() {
    console.log("Iniciando siembra de usuarios de prueba...");

    for (const user of usersToCreate) {
        // Primero, intentamos borrar al usuario por si ya existe de una prueba anterior
        const { data: { users: existingUsers } } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = existingUsers.find(u => u.email === user.email);
        if (existingUser) {
            console.log(`Usuario ${user.email} ya existe. Eliminándolo primero...`);
            await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
        }

        // Ahora creamos el usuario
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email: user.email,
            password: user.password,
            user_metadata: user.user_metadata,
            email_confirm: true // Lo confirmamos automáticamente
        });

        if (error) {
            console.error(`Error creando usuario ${user.email}:`, error.message);
        } else {
            console.log(`✅ Usuario ${data.user.email} (rol: ${data.user.user_metadata.role}) creado con éxito.`);
        }
    }
}

seedUsers();
