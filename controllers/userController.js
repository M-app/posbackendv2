const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');
const VIRTUAL_EMAIL_DOMAIN = process.env.VIRTUAL_EMAIL_DOMAIN || 'user.local';

const getUsers = async (req, res) => {
    try {
        const userRole = req.user.role;
        const tenant_id = req.user.tenant_id;

        // 1) Obtener perfiles - todos si es super_admin, solo del tenant si es admin
        let profilesQuery = supabaseAdmin
            .from('profiles')
            .select(`
                id, 
                first_name, 
                last_name, 
                username, 
                role, 
                tenant_id
            `);

        if (userRole !== 'super_admin') {
            profilesQuery = profilesQuery.eq('tenant_id', tenant_id);
        }

        const { data: profiles, error: profilesError } = await profilesQuery;
        if (profilesError) throw profilesError;

        // 2) Obtener información de tenants para super_admin
        let tenantsMap = {};
        if (userRole === 'super_admin') {
            const { data: tenants } = await supabaseAdmin
                .from('tenants')
                .select('id, name');
            tenantsMap = tenants?.reduce((acc, t) => ({ ...acc, [t.id]: t.name }), {}) || {};
        }

        // 3) Obtener emails de auth.users para cada perfil
        const users = await Promise.all(profiles.map(async (p) => {
            const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(p.id);
            return {
                id: p.id,
                firstName: p.first_name,
                lastName: p.last_name,
                username: p.username || null,
                role: p.role === 'admin' ? 'administrador' : 'vendedor',
                email: authUser?.user?.email || 'N/A',
                tenant_id: p.tenant_id,
                tenant_name: userRole === 'super_admin' ? (tenantsMap[p.tenant_id] || 'N/A') : null,
                status: 'Activo'
            };
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

        // Manejar role que puede venir como string o como objeto {label, value}
        let roleValue = role;
        if (typeof role === 'object' && role !== null) {
            roleValue = role.value || role.label || '';
        }
        const normalizedRole = (roleValue || '').toString().toLowerCase();
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
        const tenant_id = req.user.tenant_id;
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
        const tenant_id = req.user.tenant_id;

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

        // 1) Desacoplar referencias que podrían bloquear el borrado (FK RESTRICT)
        //    Ej: orders.created_by -> profiles.id
        try {
            await supabaseAdmin
                .from('orders')
                .update({ created_by: null })
                .eq('created_by', id);
        } catch (_) { /* noop: si falla, lo reportará el delete posterior */ }

        // 2) Eliminar perfil explícitamente (por si no hay ON DELETE CASCADE desde auth.users)
        try {
            await supabaseAdmin
                .from('profiles')
                .delete()
                .eq('id', id);
        } catch (_) { /* noop */ }

        // 3) Eliminar usuario en Auth
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (delErr) {
            // Supabase a veces devuelve un mensaje genérico: hacerlo más claro
            throw new Error(delErr.message || 'Database error deleting user');
        }

        return res.status(204).send();
    } catch (error) {
        return res.status(500).json({ error: error.message || 'Database error deleting user' });
    }
};

module.exports = {
    getUsers,
    createUser,
    inviteUser,
    deleteUser
};
