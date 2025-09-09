const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

const getCategories = async (req, res) => {
    try {
        const { search } = req.query;
        const tenant_id = req.user.tenant_id;
        let query = supabaseAdmin.from('categories').select('*').eq('tenant_id', tenant_id);

        // Aplicar el filtro solo si el término de búsqueda no está vacío
        if (search && search.trim() !== '') {
            // Usar una sintaxis de filtro alternativa para mayor robustez
            query = query.filter('name', 'ilike', `%${search.trim()}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const tenant_id = req.user.tenant_id;
        const { data, error } = await supabaseAdmin.from('categories').insert({ name, tenant_id }).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const tenant_id = req.user.tenant_id;
        const { data, error } = await supabaseAdmin.from('categories').update({ name }).eq('id', id).eq('tenant_id', tenant_id).select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Categoría no encontrada' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;
        const { error } = await supabaseAdmin.from('categories').delete().eq('id', id).eq('tenant_id', tenant_id);
        if (error) throw error;
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
};
