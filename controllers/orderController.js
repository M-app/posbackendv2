const supabase = require('../config/supabaseClient');

// Renombramos 'checkout' a 'createOrderTransactional' para más claridad
const createOrderTransactional = async (req, res) => {
  const orderPayload = req.body;
  // Asumimos que estos datos vienen del middleware de autenticación
  orderPayload.tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; 
  orderPayload.createdBy = req.user?.id || null; 
  
  const { data, error } = await supabase.rpc('process_order', {
    order_payload: orderPayload
  });

  if (error) {
    console.error('Error RPC (process_order):', error);
    return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
  }

  if (data && data.error) {
    console.error('Error devuelto por la función (process_order):', data);
    return res.status(400).json(data);
  }

  res.status(201).json(data);
};

const updateOrder = async (req, res) => {
    const { id } = req.params;
    const orderPayload = req.body;
    orderPayload.tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

    const { data, error } = await supabase.rpc('update_order_transactional', {
        p_order_id: id,
        p_order_payload: orderPayload
    });

    if (error) {
        console.error('Error RPC (update_order_transactional):', error);
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
    }

    if (data && data.error) {
        console.error('Error devuelto por la función (update_order_transactional):', data);
        return res.status(400).json(data);
    }

    res.status(200).json(data);
};

const deleteOrder = async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabase.rpc('delete_order_transactional', {
        p_order_id: id
    });

    if (error) {
        console.error('Error RPC (delete_order_transactional):', error);
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
    }

    if (data && data.error) {
        console.error('Error devuelto por la función (delete_order_transactional):', data);
        return res.status(400).json(data);
    }

    res.status(200).json(data);
};


const getOrders = async (req, res) => {
    const { page = 1, limit = 10, status, startDate, endDate } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * lim;

    try {
        let query = supabase
            .from('orders')
            .select(`
                *,
                customer:customers(first_name, last_name),
                seller:profiles(first_name, last_name)
            `, { count: 'exact' });
        
        if (status) query = query.eq('status', status);
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        query = query.order('date', { ascending: false }).range(offset, offset + lim - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        
        res.json({
            items: data,
            pagination: {
                page: pageNum,
                limit: lim,
                total: count,
                pages: Math.ceil(count / lim)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data, error } = await supabase
            .from('orders')
            .select(`
                *,
                customer:customers(*),
                seller:profiles(first_name, last_name),
                items:order_items(*)
            `)
            .eq('id', id)
            .single();
        
        if (error) throw error;
        if (!data) return res.status(404).json({ error: 'Orden no encontrada' });
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
  checkout: createOrderTransactional, // La ruta /checkout llama a esta función
  updateOrder,
  deleteOrder,
  getOrders,
  getOrderById,
  createOrder: (req, res) => res.status(501).json({ message: 'Use /checkout para crear una orden procesada.' }) // Placeholder
};
