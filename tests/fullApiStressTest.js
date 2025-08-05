require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURACIÓN ---
const API_BASE_URL = 'http://localhost:3001/api';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: Variables de entorno de Supabase no encontradas.");
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
let localStockState = {};
let testVariants = [];

// --- HELPERS ---
const log = (message) => console.log(`\n--- ${message} ---`);

const verifyAllStock = async (step) => {
    log(`VERIFICANDO STOCK [${step}]`);
    await new Promise(res => setTimeout(res, 1000)); // Pausa para consistencia de lectura
    let allOk = true;
    let failedProducts = {};
    const variantIds = testVariants.map(v => v.id);
    const { data: dbVariants, error: dbError } = await supabaseAdmin.from('product_variants').select('id, title, stock').in('id', variantIds);
    if(dbError) throw new Error(`Error de BD al verificar stock: ${dbError.message}`);

    for (const variant of dbVariants) {
        const expected = localStockState[variant.id];
        const real = variant.stock;
        if (real !== expected) {
            allOk = false;
            failedProducts[variant.title] = { DB_Stock: real, Local_Stock: expected, Match: '❌ FALLO' };
        }
    }

    if (allOk) {
        console.log(`✅ Verificación de stock [${step}] completada con éxito.`);
    } else {
        console.log("FALLOS ENCONTRADOS:");
        console.table(failedProducts);
        throw new Error(`Fallo en la verificación de stock en el paso: ${step}`);
    }
    return true;
};

// --- FASES DE PRUEBA ---
async function runFullApiStressTest() {
    log("INICIANDO PRUEBA DE ESTRÉS FINAL DE API");
    let createdOrders = [];

    try {
        // 1. SETUP
        log("FASE 1: SETUP (50 Productos)");
        await supabaseAdmin.from('product_variants').delete().like('code', 'FULL_API%');
        for (let i = 0; i < 50; i++) {
            const code = `FULL_API_${i.toString().padStart(2, '0')}`;
            const { data: v, error } = await supabaseAdmin.from('product_variants')
                .upsert({ code, title: `Full API Stress ${i}`, stock: 20000, tenant_id: tenantId }, { onConflict: 'code' })
                .select().single();
            if (error) throw new Error(`Error en Setup para ${code}: ${error.message}`);
            testVariants.push(v);
            localStockState[v.id] = 20000;
        }
        console.log("50 productos de prueba listos.");

        // 2. CREAR ÓRDENES
        log("FASE 2: CREANDO 50 ÓRDENES GRANDES VÍA API");
        for (let i = 0; i < 50; i++) {
            const shuffled = [...testVariants].sort(() => 0.5 - Math.random());
            const itemCount = Math.floor(Math.random() * 11) + 20; // 20-30 productos
            const selectedVariants = shuffled.slice(0, itemCount);
            let orderItems = [];
            for (const variant of selectedVariants) {
                const quantity = Math.floor(Math.random() * 5) + 1; // 1-5 unidades
                if (localStockState[variant.id] >= quantity) {
                    orderItems.push({ variantId: variant.id, quantity, price: 1, name: variant.title, variantTitle: variant.title });
                    localStockState[variant.id] -= quantity;
                }
            }
            if(orderItems.length === 0) continue;
            const total = orderItems.reduce((acc, item) => acc + item.quantity, 0);
            const { data, status } = await axios.post(`${API_BASE_URL}/orders/checkout`, { items: orderItems, total, tenantId });
            if (status !== 201 || data.error) throw new Error(`Error creando orden ${i}: ${JSON.stringify(data?.error)}`);
            createdOrders.push({ id: data.orderId, items: orderItems });
        }
        await verifyAllStock("Post-Creación");

        // 3. MODIFICAR ÓRDENES
        log("FASE 3: MODIFICANDO 50 ÓRDENES VÍA API");
        for (const order of createdOrders) {
            let modifiedItems = JSON.parse(JSON.stringify(order.items));
            const itemToChange = modifiedItems[Math.floor(Math.random() * modifiedItems.length)];
            const change = (Math.floor(Math.random() * 6) + 1) - 3; // de -2 a +4
            if (localStockState[itemToChange.variantId] >= change && (itemToChange.quantity + change > 0)) {
                localStockState[itemToChange.variantId] -= change;
                itemToChange.quantity += change;
            }
            const total = modifiedItems.reduce((acc, item) => acc + item.quantity, 0);
            const { data, status } = await axios.put(`${API_BASE_URL}/orders/${order.id}`, { items: modifiedItems, total, tenantId });
            if (status !== 200 || data.error) {
                localStockState[itemToChange.variantId] += change; // Revertir si falla
            } else {
                order.items = modifiedItems;
            }
        }
        await verifyAllStock("Post-Modificación");

        // 4. ELIMINAR ÓRDENES
        log("FASE 4: ELIMINANDO 10 ÓRDENES VÍA API");
        const ordersToDelete = createdOrders.slice(0, 10);
        for (const order of ordersToDelete) {
            order.items.forEach(item => { localStockState[item.variantId] += item.quantity });
            const { data, status } = await axios.delete(`${API_BASE_URL}/orders/${order.id}`);
            if (status !== 200 || data.error) throw new Error(`Error eliminando orden ${order.id}: ${JSON.stringify(data?.error)}`);
        }
        await verifyAllStock("Post-Eliminación");

        console.log("\n\n✅✅✅ PRUEBA DE ESTRÉS FINAL DE API COMPLETADA CON ÉXITO ✅✅✅");

    } catch (e) {
        if (axios.isAxiosError(e)) {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: Error de API - ${e.message} ❌❌❌`, e.response?.data);
        } else {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: ${e.message} ❌❌❌`);
        }
    } finally {
        log("FASE 5: LIMPIEZA FINAL");
        const orderIds = createdOrders.map(o => o.id);
        if (orderIds.length > 0) {
            await supabaseAdmin.from('order_items').delete().in('order_id', orderIds);
            await supabaseAdmin.from('orders').delete().in('id', orderIds);
        }
        await supabaseAdmin.from('product_variants').delete().like('code', 'FULL_API%');
        console.log("Datos de prueba eliminados.");
    }
}

runFullApiStressTest();
