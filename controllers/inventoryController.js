const supabase = require('../config/supabaseClient');

const createInventoryRecord = async (req, res) => {
    const payload = req.body;
    payload.tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

    // Normalizar items camelCase -> snake_case para RPC
    if (Array.isArray(payload.items)) {
        payload.items = payload.items.map((item) => ({
            variant_id: item.variant_id ?? item.variantId ?? item.variant?.id ?? null,
            quantity: item.quantity,
            cost: item.cost ?? null
        }));
    }

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

    // Normalizar items camelCase -> snake_case para RPC
    if (Array.isArray(payload.items)) {
        payload.items = payload.items.map((item) => ({
            variant_id: item.variant_id ?? item.variantId ?? item.variant?.id ?? null,
            quantity: item.quantity,
            cost: item.cost ?? null
        }));
    }

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
    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * lim;

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

        const { data, error, count } = await query.order('date', { ascending: false }).range(offset, offset + lim - 1);
        if (error) throw error;
        
        res.json({
            items: data,
            pagination: { page: pageNum, limit: lim, total: count, pages: Math.ceil(count / lim) }
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
            .select(`*, items:inventory_record_items(*, variant:product_variants(id, code, title, cost, product:products(id, name)))`)
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
    try {
        const { productId } = req.params;

        // Soportar tanto objetos anidados como claves con corchetes en querystring
        const q = req.query || {};
        const qp = q.pagination || {};
        const qf = q.filters || {};

        const sortBy = qp.sortBy || q['pagination[sortBy]'] || 'date';
        const descendingRaw =
            typeof qp.descending !== 'undefined'
                ? qp.descending
                : (q['pagination[descending]']);
        const pageRaw = qp.page || q['pagination[page]'] || 1;
        const rppRaw = qp.rowsPerPage || q['pagination[rowsPerPage]'] || 10;

        const startDate = qf.startDate || q['filters[startDate]'] || null;
        const endDate = qf.endDate || q['filters[endDate]'] || null;

        // Helpers para normalizar fechas (acepta YYYY/MM/DD o YYYY-MM-DD)
        const toIsoStartOfDay = (ds) => {
            if (!ds) return null;
            try {
                const parts = String(ds).replace(/-/g, '/').split('/').map(Number);
                if (parts.length !== 3) return null;
                const [y, m, d] = parts;
                const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
                return dt.toISOString();
            } catch (_) { return null; }
        };
        const toIsoStartOfNextDay = (ds) => {
            if (!ds) return null;
            try {
                const parts = String(ds).replace(/-/g, '/').split('/').map(Number);
                if (parts.length !== 3) return null;
                const [y, m, d] = parts;
                const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
                return dt.toISOString();
            } catch (_) { return null; }
        };

        const page = parseInt(pageRaw, 10) || 1;
        const limit = parseInt(rppRaw, 10) || 10;
        const offset = (page - 1) * limit;
        const descending = String(descendingRaw).toLowerCase() === 'true';

        // Seleccionar items de inventario y embeber datos del registro y variante
        let query = supabase
            .from('inventory_record_items')
            .select(`
                id,
                quantity,
                variant:product_variants!inner(title, product_id),
                record:inventory_records!inner(id, date, type, description)
            `, { count: 'exact' })
            .eq('product_variants.product_id', productId);

        // Filtros por fecha sobre el registro padre (fin de rango inclusivo)
        const isoStart = toIsoStartOfDay(startDate);
        if (isoStart) {
            query = query.gte('inventory_records.date', isoStart);
        }
        const isoEndNext = toIsoStartOfNextDay(endDate);
        if (isoEndNext) {
            query = query.lt('inventory_records.date', isoEndNext);
        }

        // Ordenamiento
        const validSorts = new Set(['date', 'type', 'quantity']);
        const sortKey = validSorts.has(sortBy) ? sortBy : 'date';
        if (sortKey === 'quantity') {
            query = query.order('quantity', { ascending: !descending });
        } else {
            // Ordenar por campos del registro padre
            query = query.order(sortKey, { ascending: !descending, foreignTable: 'inventory_records' });
        }

        // Paginación
        const { data, error, count } = await query.range(offset, offset + limit - 1);
        if (error) throw error;

        const items = (data || []).map((it) => ({
            recordId: it.record?.id,
            date: it.record?.date,
            type: it.record?.type,
            quantity: it.quantity,
            variantTitle: it.variant?.title || '',
            description: it.record?.description || ''
        }));

        return res.json({
            items,
            pagination: {
                page,
                limit,
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        });
    } catch (error) {
        return res.status(500).json({ error: 'Error obteniendo movimientos', details: error.message });
    }
};

module.exports = {
    createInventoryRecord,
    updateInventoryRecord,
    deleteInventoryRecord,
    getInventoryRecords,
    getInventoryRecordById,
    getProductMovements
};
