const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');
const VIRTUAL_EMAIL_DOMAIN = process.env.VIRTUAL_EMAIL_DOMAIN || 'user.local';

const getUsers = async (req, res) => {
    try {
        // En un escenario real, filtraríamos por tenant_id
        // const tenant_id = req.user.tenant_id;

        // 1) Obtener perfiles + email desde la vista (evita usar admin.listUsers)
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles_with_auth')
            .select('id, first_name, last_name, username, role, email');
            // .eq('tenant_id', tenant_id);
        if (profilesError) throw profilesError;

        // 2) Mapear datos
        const users = profiles.map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            username: p.username || null,
            role: p.role === 'admin' ? 'administrador' : 'vendedor',
            email: p.email || 'N/A',
            status: 'Activo'
        }));

        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createUser = async (req, res) => {
    try {
        const { username, email, firstName, lastName, password, role } = req.body || {};

        if (!password || password.length < 6) {
            return res.status(400).json({ error: 'La contraseña es requerida y debe tener al menos 6 caracteres' });
        }

        const normalizedRole = (role || '').toLowerCase();
        if (!['administrador', 'vendedor', 'admin', 'seller'].includes(normalizedRole)) {
            return res.status(400).json({ error: 'Rol inválido. Use "administrador" o "vendedor"' });
        }
        const roleToStore = ['administrador', 'admin'].includes(normalizedRole) ? 'admin' : 'seller';

        const trimmedUsername = (username || '').trim();
        const trimmedEmail = (email || '').trim();

        if (!trimmedUsername && !trimmedEmail) {
            return res.status(400).json({ error: 'Debe proporcionar un nombre de usuario o un correo electrónico' });
        }

        const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
        let finalEmail = trimmedEmail;
        if (!finalEmail) {
            if (emailRegex.test(trimmedUsername)) {
                finalEmail = trimmedUsername;
            } else {
                // Generar un correo interno basado en el username (para permitir login futuro por username)
                finalEmail = `${trimmedUsername}@${VIRTUAL_EMAIL_DOMAIN}`;
            }
        }

        // Verificar unicidad de username si viene provisto
        if (trimmedUsername) {
            const { data: existingUsername, error: usernameError } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('username', trimmedUsername)
                .maybeSingle();
            if (usernameError && usernameError.code !== 'PGRST116') {
                throw usernameError;
            }
            if (existingUsername) {
                return res.status(409).json({ error: 'El nombre de usuario ya existe' });
            }
        }

        // Crear usuario en Auth
        const tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // TODO: obtener de middleware de auth
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: finalEmail,
            password,
            email_confirm: true,
            user_metadata: {
                role: roleToStore,
                tenant_id
            }
        });
        if (createError) {
            // Errores comunes: email ya existe
            return res.status(400).json({ error: createError.message });
        }

        const userId = created.user?.id;
        if (!userId) {
            return res.status(500).json({ error: 'No se pudo obtener el ID del usuario creado' });
        }

        // Insertar o actualizar perfil (por si existe trigger que ya insertó la fila)
        const { data: upsertedProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: userId,
                first_name: firstName || null,
                last_name: lastName || null,
                role: roleToStore,
                username: trimmedUsername || null,
                tenant_id
            }, { onConflict: 'id' })
            .select('id, first_name, last_name, username, role')
            .single();
        if (profileError) {
            // En caso de error al insertar perfil, eliminar el usuario para evitar huérfanos
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return res.status(400).json({ error: profileError.message });
        }

        return res.status(201).json({
            id: userId,
            firstName: upsertedProfile?.first_name || firstName || '',
            lastName: upsertedProfile?.last_name || lastName || '',
            username: upsertedProfile?.username || trimmedUsername || null,
            role: roleToStore === 'admin' ? 'administrador' : 'vendedor',
            email: finalEmail,
            status: 'Activo'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const inviteUser = async (req, res) => {
    try {
        const { email, role } = req.body;
        const tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Sacar del middleware de auth

        // Usamos el cliente de admin para invitar a un nuevo usuario
        const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { 
                role: role || 'seller',
                tenant_id: tenant_id
            }
        });

        if (error) throw error;

        res.status(201).json({ message: 'Invitación enviada con éxito', user: data.user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Usamos el cliente de admin para eliminar un usuario.
        // El perfil se eliminará automáticamente gracias al ON DELETE CASCADE.
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
        
        if (error) throw error;
        
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getUsers,
    createUser,
    inviteUser,
    deleteUser
};
