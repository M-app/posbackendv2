const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

// Renombramos 'checkout' a 'createOrderTransactional' para más claridad
const createOrderTransactional = async (req, res) => {
  const orderPayload = req.body;
  
  console.log('=== CREATE ORDER DEBUG ===');
  console.log('User ID:', req.user?.id);
  console.log('Tenant ID:', req.user?.tenant_id);
  console.log('Payload keys:', Object.keys(orderPayload));
  console.log('Payload ID:', orderPayload.id);
  const isUpdate = Boolean(orderPayload?.id);
  
  // Asumimos que estos datos vienen del middleware de autenticación
  orderPayload.tenantId = req.user.tenant_id;
  orderPayload.tenant_id = orderPayload.tenantId; // compat camel/snake
  orderPayload.createdBy = req.user?.id || orderPayload.createdBy || null;
  orderPayload.created_by = orderPayload.createdBy; // compat camel/snake
  // Normalizar customer
  if (orderPayload.customer || orderPayload.customerId || orderPayload.customer_id) {
    orderPayload.customer_id = orderPayload.customer_id || orderPayload.customerId || orderPayload.customer?.id || null;
  }
  // Normalizar items a snake_case para RPC
  if (Array.isArray(orderPayload.items)) {
    orderPayload.items = orderPayload.items.map((it) => ({
      variant_id: it.variant_id ?? it.variantId ?? null,
      quantity: it.quantity,
      price: it.price,
      name: it.name,
      variant_title: it.variantTitle ?? it.variant_title ?? null
    }));
  }
  
  // Si viene ID, interpretamos como actualización y usamos la RPC de update
  if (isUpdate) {
    console.log('Checkout recibido con ID; se redirige a update_order_transactional');
    try {
      // 1) Leer estado actual de la orden e items para comparar y evitar tocar inventario si no cambian
      const orderId = orderPayload.id;
      const tenantId = orderPayload.tenant_id;

      const [{ data: existingOrder, error: existingOrderError }, { data: existingItems, error: existingItemsError }] = await Promise.all([
        supabaseAdmin
          .from('orders')
          .select('id, tenant_id, customer_id')
          .eq('id', orderId)
          .eq('tenant_id', tenantId)
          .single(),
        supabaseAdmin
          .from('order_items')
          .select('variant_id, quantity, price')
          .eq('order_id', orderId)
      ]);

      if (existingOrderError) {
        console.error('Error obteniendo orden existente:', existingOrderError);
        return res.status(500).json({ error: 'No se pudo obtener la orden existente' });
      }
      if (existingItemsError) {
        console.error('Error obteniendo items existentes:', existingItemsError);
        return res.status(500).json({ error: 'No se pudieron obtener los items existentes' });
      }

      const normalizeItems = (arr) =>
        (Array.isArray(arr) ? arr : [])
          .map(it => ({
            variant_id: it.variant_id ?? it.variantId ?? null,
            quantity: Number(it.quantity || 0),
            price: Number(it.price || 0)
          }))
          .filter(it => it.variant_id);

      const newItems = normalizeItems(orderPayload.items);
      const oldItems = normalizeItems(existingItems);

      const itemsToKeyQty = (list) => {
        const m = new Map();
        for (const it of list) {
          const key = `${it.variant_id}`; // la cantidad es el valor
          m.set(key, (m.get(key) || 0) + Number(it.quantity || 0));
        }
        return m;
      };

      const oldMap = itemsToKeyQty(oldItems);
      const newMap = itemsToKeyQty(newItems);

      const sameKeys = oldMap.size === newMap.size && [...oldMap.keys()].every(k => newMap.has(k));
      let itemsAreEqual = sameKeys;
      if (itemsAreEqual) {
        for (const [k, v] of oldMap) {
          if (newMap.get(k) !== v) { itemsAreEqual = false; break; }
        }
      }

      // 2) Si los items no cambian, solo actualizar metadatos (cliente, vendedor) sin tocar inventario
      if (itemsAreEqual) {
        const updates = {};
        if (orderPayload.created_by && orderPayload.created_by !== existingOrder?.created_by) updates.created_by = orderPayload.created_by;
        if (orderPayload.customer_id && orderPayload.customer_id !== existingOrder?.customer_id) updates.customer_id = orderPayload.customer_id;
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          const { error: updErr } = await supabaseAdmin
            .from('orders')
            .update(updates)
            .eq('id', orderId)
            .eq('tenant_id', tenantId);
          if (updErr) {
            console.error('Error actualizando metadatos de la orden:', updErr);
            return res.status(500).json({ error: 'No se pudo actualizar la orden' });
          }
        }
        return res.status(200).json({ success: true, order_id: orderId });
      }

      // 3) Si cambian los items, enviar original_items a la RPC para un ajuste correcto del stock
      const original_items = oldItems.map(it => ({
        variant_id: it.variant_id,
        quantity: it.quantity,
        price: it.price
      }));

      const payloadForRpc = {
        ...orderPayload,
        items: newItems,
        original_items,
        tenant_id: tenantId
      };

      const { data, error } = await supabaseAdmin.rpc('update_order_transactional', {
        p_order_id: orderId,
        p_order_payload: payloadForRpc
      });

      if (error) {
        console.error('Error RPC (update_order_transactional via checkout):', error);
        return res.status(500).json({ error: 'Error en la base de datos', details: error.message });
      }

      if (data && data.error) {
        console.error('Error devuelto por la función (update_order_transactional):', data);
        return res.status(400).json(data);
      }

      // 4) Si se envió customer_id, asegurar su actualización (fuera de la RPC para no tocar inventario)
      if (orderPayload.customer_id && orderPayload.customer_id !== existingOrder?.customer_id) {
        const { error: custErr } = await supabaseAdmin
          .from('orders')
          .update({ customer_id: orderPayload.customer_id, updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('tenant_id', tenantId);
        if (custErr) {
          console.warn('No se pudo actualizar customer_id después de la RPC:', custErr?.message);
        }
      }

      console.log('Update via checkout exitoso');
      return res.status(200).json(data);
    } catch (err) {
      console.error('Error general en update via checkout:', err);
      return res.status(500).json({ error: 'Error actualizando la orden' });
    }
  }

  // Si no hay ID, crear una nueva orden
  const { data, error } = await supabaseAdmin.rpc('process_order', {
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

  // Asegurar vendedor (created_by) si la RPC no lo asignó
  try {
    const createdOrderId = data?.order_id || data?.orderId || data?.id;
    if (createdOrderId && orderPayload.created_by) {
      await supabaseAdmin
        .from('orders')
        .update({ created_by: orderPayload.created_by })
        .eq('id', createdOrderId);
    }
  } catch (e) {
    console.warn('No se pudo asegurar created_by en orders:', e?.message);
  }

  res.status(201).json(data);
};

const updateOrder = async (req, res) => {
    const { id } = req.params;
    const orderPayload = req.body;
    
    console.log('=== UPDATE ORDER DEBUG ===');
    console.log('Order ID:', id);
    console.log('User ID:', req.user?.id);
    console.log('Tenant ID:', req.user?.tenant_id);
    console.log('Payload keys:', Object.keys(orderPayload));
    
    orderPayload.tenantId = req.user.tenant_id;
    orderPayload.tenant_id = orderPayload.tenantId;
    orderPayload.createdBy = req.user?.id || orderPayload.createdBy || null;
    orderPayload.created_by = orderPayload.createdBy;
    
    if (orderPayload.customer || orderPayload.customerId || orderPayload.customer_id) {
      orderPayload.customer_id = orderPayload.customer_id || orderPayload.customerId || orderPayload.customer?.id || null;
      console.log('Customer ID assigned:', orderPayload.customer_id);
    }
    
    if (Array.isArray(orderPayload.items)) {
        orderPayload.items = orderPayload.items.map((it) => ({
          variant_id: it.variant_id ?? it.variantId ?? null,
          quantity: it.quantity,
          price: it.price,
          name: it.name,
          variant_title: it.variantTitle ?? it.variant_title ?? null
        }));
    }

    console.log('Calling RPC with payload:', { p_order_id: id, p_order_payload: orderPayload });

    const { data, error } = await supabaseAdmin.rpc('update_order_transactional', {
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

    console.log('Update successful, returning data:', data);
    res.status(200).json(data);
};

const deleteOrder = async (req, res) => {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin.rpc('delete_order_transactional', {
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
    const { page = 1, limit = 10, status, startDate, endDate, sellerId } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * lim;
    const tenant_id = req.user.tenant_id;

    try {
        let query = supabaseAdmin
            .from('orders')
            .select(`
                *,
                customer:customers(first_name, last_name),
                items:order_items(quantity)
            `, { count: 'exact' })
            .eq('tenant_id', tenant_id);
        
        if (status) query = query.eq('status', status);
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);
        if (sellerId) query = query.eq('created_by', sellerId);

        query = query.order('date', { ascending: false }).range(offset, offset + lim - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        
        // Enriquecer con información del vendedor (created_by)
        const sellerIds = Array.from(new Set((data || [])
          .map(o => o.created_by)
          .filter(Boolean)));
        let sellersMap = new Map();
        if (sellerIds.length > 0) {
            const { data: sellers, error: sellersError } = await supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, username')
                .in('id', sellerIds)
                .eq('tenant_id', tenant_id);
            if (!sellersError && Array.isArray(sellers)) {
                sellersMap = new Map(sellers.map(s => [s.id, s]));
            }
        }

        const enriched = (data || []).map(o => {
            const s = sellersMap.get(o.created_by);
            const fullName = s ? `${s.first_name || ''} ${s.last_name || ''}`.trim() : '';
            const sellerName = fullName || s?.username || '—';
            return { ...o, sellerName };
        });

        res.json({
            items: enriched,
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

// Estadísticas de órdenes por rango (total órdenes, items, total ventas) y por vendedor
const getOrdersStats = async (req, res) => {
    try {
        const { startDate, endDate, sellerId } = req.query;
        const tenant_id = req.user.tenant_id;
        let query = supabaseAdmin
            .from('orders')
            .select('id, total, created_by, items:order_items(quantity)', { count: 'exact' })
            .eq('tenant_id', tenant_id);
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);
        if (sellerId) query = query.eq('created_by', sellerId);
        const { data, error, count } = await query;
        if (error) throw error;
        const orders = count || (data ? data.length : 0);
        const items = (data || []).reduce((sum, o) => sum + (Array.isArray(o.items) ? o.items.reduce((s, it) => s + (it.quantity || 0), 0) : 0), 0);
        const total = (data || []).reduce((sum, o) => sum + Number(o.total || 0), 0);
        res.json({ orders, items, total, avg: orders > 0 ? total / orders : 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenant_id = req.user.tenant_id;
        const { data, error } = await supabaseAdmin
            .from('orders')
            .select(`
                *,
                customer:customers(*),
                items:order_items(*, variant:product_variants(id, code, title, stock, product:products(name)))
            `)
            .eq('id', id)
            .eq('tenant_id', tenant_id)
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
  createOrder: createOrderTransactional, // La ruta POST / también usa la misma función
  updateOrder,
  deleteOrder,
  getOrders,
  getOrderById,
  getOrdersStats
};
