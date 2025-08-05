const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

const getUsers = async (req, res) => {
    try {
        // En un escenario real, filtraríamos por tenant_id
        // const tenant_id = req.user.tenant_id;
        const { data, error } = await supabase
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                role,
                user:users(email)
            `);
            // .eq('tenant_id', tenant_id);
        
        if (error) throw error;

        // El resultado puede necesitar ser aplanado para que coincida con la UI
        const users = data.map(p => ({
            id: p.id,
            firstName: p.first_name,
            lastName: p.last_name,
            role: p.role,
            email: p.user?.email || 'N/A'
        }));

        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
    inviteUser,
    deleteUser
};
