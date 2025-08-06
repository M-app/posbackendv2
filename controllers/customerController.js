const supabase = require('../config/supabaseClient');

const getCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', routeId = null } = req.query;

        const { data, error } = await supabase.rpc('search_customers_paginated', {
            p_search_term: search,
            p_route_id: routeId,
            p_page_num: parseInt(page),
            p_page_size: parseInt(limit)
        });

        if (error) throw error;

        const total_count = data.length > 0 ? data[0].total_count : 0;

        // Quitamos la columna 'total_count' de cada objeto antes de enviarla
        const items = data.map(({ total_count, ...rest }) => rest);

        res.json({
            items,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total_count,
                pages: Math.ceil(total_count / limit)
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
            tenant_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' // Sacar del middleware de auth
        };

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
