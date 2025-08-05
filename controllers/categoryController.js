const supabase = require('../config/supabaseClient');

const getCategories = async (req, res) => {
    try {
        const { data, error } = await supabase.from('categories').select('*');
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Sacar del middleware de auth
        const { data, error } = await supabase.from('categories').insert({ name, tenant_id }).select().single();
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
        const { data, error } = await supabase.from('categories').update({ name }).eq('id', id).select().single();
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
        const { error } = await supabase.from('categories').delete().eq('id', id);
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
