const supabase = require('../config/supabaseClient');

const getCustomers = async (req, res) => {
    const { page = 1, limit = 10, search } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = supabase
            .from('customers')
            .select('*', { count: 'exact' });

        if (search) {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({
            items: data,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count,
                pages: Math.ceil(count / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase.from('customers').select('*').eq('id', id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createCustomer = async (req, res) => {
    try {
        const customerData = req.body;
        customerData.tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Sacar del middleware de auth
        const { data, error } = await supabase.from('customers').insert(customerData).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customerData = req.body;
        const { data, error } = await supabase.from('customers').update(customerData).eq('id', id).select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) throw error;
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
};
