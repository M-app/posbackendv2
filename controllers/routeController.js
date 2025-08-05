const supabase = require('../config/supabaseClient');

const getRoutes = async (req, res) => {
    try {
        const { page = 1, limit = 15, sortBy = 'name', descending = 'false', search } = req.query;
        const offset = (page - 1) * limit;

        let query = supabase.from('routes').select('*', { count: 'exact' });

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        query = query.order(sortBy, { ascending: descending === 'false' });
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

const getRouteById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: route, error: routeError } = await supabase.from('routes').select('*').eq('id', id).single();
        if (routeError) throw routeError;
        if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });

        const { data: customers, error: customerError } = await supabase.from('customers').select('*').eq('route_id', id);
        if (customerError) throw customerError;

        res.json({ ...route, customers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createRoute = async (req, res) => {
    try {
        const routeData = req.body;
        routeData.tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Sacar del middleware de auth
        const { data, error } = await supabase.from('routes').insert(routeData).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateRoute = async (req, res) => {
    try {
        const { id } = req.params;
        const routeData = req.body;
        const { data, error } = await supabase.from('routes').update(routeData).eq('id', id).select().single();
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Ruta no encontrada' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteRoute = async (req, res) => {
    try {
        const { id } = req.params;
        // Los clientes asociados tendrán su route_id puesto a NULL por la FK
        const { error } = await supabase.from('routes').delete().eq('id', id);
        if (error) throw error;
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateRouteCustomers = async (req, res) => {
    try {
        const { id } = req.params; // id de la ruta
        const { customerIds } = req.body;
        const tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

        // Usar una función RPC para hacer esto transaccional
        const { data, error } = await supabase.rpc('update_route_customers', {
            p_route_id: id,
            p_customer_ids: customerIds,
            p_tenant_id: tenant_id
        });

        if (error) throw error;

        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getRoutes,
    getRouteById,
    createRoute,
    updateRoute,
    deleteRoute,
    updateRouteCustomers
};
