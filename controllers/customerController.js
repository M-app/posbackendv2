const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

const getCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', routeId = null } = req.query;
        const tenant_id = req.user.tenant_id;
        const pageNum = parseInt(page, 10) || 1;
        const lim = parseInt(limit, 10) || 10;
        const offset = (pageNum - 1) * lim;

        let query = supabaseAdmin
            .from('customers')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenant_id);

        if (search && search.trim() !== '') {
            query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
        }

        if (routeId) {
            query = query.eq('route_id', routeId);
        }

        const { data, error, count } = await query
            .order('first_name', { ascending: true })
            .range(offset, offset + lim - 1);

        if (error) throw error;

        res.json({
            items: data || [],
            pagination: {
                page: pageNum,
                limit: lim,
                total: count || 0,
                pages: Math.ceil((count || 0) / lim)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;
        const { data, error } = await supabaseAdmin.from('customers').select('*').eq('id', id).eq('tenant_id', tenant_id).single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Cliente no encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createCustomer = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, address, city, state, zipCode, routeId } = req.body;
        const tenant_id = req.user.tenant_id;
        
        const customerData = {
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            address,
            city,
            state,
            zip_code: zipCode,
            route_id: routeId,
            tenant_id
        };

        const { data, error } = await supabaseAdmin.from('customers').insert(customerData).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { firstName, lastName, email, phone, address, city, state, zipCode, routeId } = req.body;

        const customerData = {
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            address,
            city,
            state,
            zip_code: zipCode,
            route_id: routeId,
        };

        // Eliminar campos undefined para no sobreescribir con null
        Object.keys(customerData).forEach(key => customerData[key] === undefined && delete customerData[key]);

        const { data, error } = await supabaseAdmin.from('customers').update(customerData).eq('id', id).eq('tenant_id', req.user.tenant_id).select().single();
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
        const { error } = await supabaseAdmin.from('customers').delete().eq('id', id).eq('tenant_id', req.user.tenant_id);
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
