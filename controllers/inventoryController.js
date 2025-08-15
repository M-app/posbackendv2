const supabase = require('../config/supabaseClient');

const createInventoryRecord = async (req, res) => {
    const payload = req.body;
    payload.tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

    const { data, error } = await supabase.rpc('create_inventory_record_transactional', {
        p_payload: payload
    });

    if (error) {
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
    }
    if (data && data.error) {
        return res.status(400).json(data);
    }
    res.status(201).json(data);
};

const updateInventoryRecord = async (req, res) => {
    const { id } = req.params;
    const payload = req.body;
    payload.tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

    const { data, error } = await supabase.rpc('update_inventory_record_transactional', {
        p_record_id: id,
        p_payload: payload
    });

    if (error) {
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
    }
    if (data && data.error) {
        return res.status(400).json(data);
    }
    res.status(200).json(data);
};

const deleteInventoryRecord = async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase.rpc('delete_inventory_record_transactional', {
        p_record_id: id
    });

    if (error) {
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
    }
    if (data && data.error) {
        return res.status(400).json(data);
    }
    res.status(200).json(data);
};

const getInventoryRecords = async (req, res) => {
    const { page = 1, limit = 10, type, search } = req.query;
    const offset = (page - 1) * limit;

    try {
        let query = supabase
            .from('inventory_records')
            .select(`
                *,
                items:inventory_record_items(
                    *,
                    variant:product_variants(
                        code, 
                        title,
                        product:products(name)
                    )
                )
            `, { count: 'exact' });
        
        if (type) query = query.eq('type', type);

        const { data, error, count } = await query.order('date', { ascending: false }).range(offset, offset + limit - 1);
        if (error) throw error;
        
        res.json({
            items: data,
            pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / limit) }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getInventoryRecordById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('inventory_records')
            .select(`*, items:inventory_record_items(*, variant:product_variants(code, title))`)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getProductMovements = async (req, res) => {
    res.status(501).json({ message: "No implementado todavía" });
};

module.exports = {
    createInventoryRecord,
    updateInventoryRecord,
    deleteInventoryRecord,
    getInventoryRecords,
    getInventoryRecordById,
    getProductMovements
};
