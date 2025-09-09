const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

const getRoutes = async (req, res) => {
    try {
        const { page = 1, limit = 15, sortBy = 'name', descending = 'false', search } = req.query;
        const tenant_id = req.user.tenant_id;
        
        let query = supabaseAdmin.from('routes').select('*', { count: 'exact' }).eq('tenant_id', tenant_id);

        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        query = query.order(sortBy, { ascending: descending === 'false' });

        // Solo aplicar paginación si limit no es 0
        const parsedLimit = parseInt(limit);
        if (parsedLimit !== 0) {
            const offset = (page - 1) * parsedLimit;
            query = query.range(offset, offset + parsedLimit - 1);
        }

        const { data, error, count } = await query;
        if (error) throw error;
        
        res.json({
            items: data,
            pagination: {
                page: parseInt(page),
                limit: parsedLimit,
                total: count,
                pages: parsedLimit !== 0 ? Math.ceil(count / parsedLimit) : 1
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getRouteById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;
        const { data: route, error: routeError } = await supabaseAdmin.from('routes').select('*').eq('id', id).eq('tenant_id', tenant_id).single();
        if (routeError) throw routeError;
        if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });

        const { data: customers, error: customerError } = await supabaseAdmin.from('customers').select('*').eq('route_id', id).eq('tenant_id', tenant_id);
        if (customerError) throw customerError;

        res.json({ ...route, customers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createRoute = async (req, res) => {
    try {
        const { name, description } = req.body;
        const tenant_id = req.user.tenant_id;
        const routeData = {
            name,
            description,
            tenant_id
        };
        const { data, error } = await supabaseAdmin.from('routes').insert(routeData).select().single();
        if (error) throw error;
        res.status(201).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateRoute = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;
        const tenant_id = req.user.tenant_id;
        const routeData = { name, description };

        Object.keys(routeData).forEach(key => routeData[key] === undefined && delete routeData[key]);

        const { data, error } = await supabaseAdmin.from('routes').update(routeData).eq('id', id).eq('tenant_id', tenant_id).select().single();
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
        const tenant_id = req.user.tenant_id;
        // Los clientes asociados tendrán su route_id puesto a NULL por la FK
        const { error } = await supabaseAdmin.from('routes').delete().eq('id', id).eq('tenant_id', tenant_id);
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
        const tenant_id = req.user.tenant_id;

        // Usar una función RPC para hacer esto transaccional
        const { data, error } = await supabaseAdmin.rpc('update_route_customers', {
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
