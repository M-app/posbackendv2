require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURACIÓN ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: Variables de entorno de Supabase no encontradas.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';
let localStockState = {};
let testVariants = [];

// --- HELPERS ---
const log = (message, data = null) => {
    console.log(`\n--- ${message} ---`);
    if(data) console.log(data);
};

const verifyAllStock = async (step) => {
    log(`VERIFICANDO STOCK [${step}]`);
    let allOk = true;
    let comparison = {};
    for (const variant of testVariants) {
        const { data, error } = await supabase.from('product_variants').select('stock').eq('id', variant.id).single();
        if (error) throw new Error(`Error al verificar stock para ${variant.title}: ${error.message}`);

        const expected = localStockState[variant.id];
        const real = data.stock;
        comparison[variant.title] = { DB_Stock: real, Local_Stock: expected, Match: real === expected ? '✅ OK' : '❌ FALLO' };
        if (real !== expected) allOk = false;
    }
    console.table(comparison);
    if (!allOk) throw new Error(`Fallo en la verificación de stock en el paso: ${step}`);
    console.log(`✅ Verificación de stock [${step}] completada con éxito.`);
    return true;
};

// --- FASES DE PRUEBA ---
async function runMediumComplexityTest() {
    log("INICIANDO PRUEBA DE MEDIANA COMPLEJIDAD");
    let createdOrders = [];

    try {
        // 1. SETUP
        log("FASE 1: SETUP");
        await supabaseAdmin.from('product_variants').delete().like('code', 'MCT%');
        const productInfos = [
            { name: "Med Comp Test A", code: "MCTA01", initialStock: 1000 },
            { name: "Med Comp Test B", code: "MCTB01", initialStock: 1000 },
            { name: "Med Comp Test C", code: "MCTC01", initialStock: 1000 },
            { name: "Med Comp Test D", code: "MCTD01", initialStock: 1000 },
            { name: "Med Comp Test E", code: "MCTE01", initialStock: 1000 },
        ];
        for (const info of productInfos) {
            const { data: v, error } = await supabaseAdmin.from('product_variants').insert({ title: info.name, code: info.code, stock: info.initialStock, tenant_id: tenantId }).select().single();
            if(error) throw new Error(`Error en Setup: ${error.message}`);
            testVariants.push(v);
            localStockState[v.id] = v.stock;
        }
        console.log("Productos de prueba creados/actualizados.");

        // 2. CREAR ÓRDENES
        log("FASE 2: CREANDO 10 ÓRDENES");
        for(let i=0; i<10; i++){
            const variant = testVariants[i % testVariants.length]; // Ciclar sobre los productos
            const quantity = 10;
            const orderItems = [{ variantId: variant.id, quantity, price: 1, name: variant.title, variantTitle: variant.title }];
            const { data, error } = await supabase.rpc('process_order', { order_payload: { items: orderItems, total: 10, tenantId } });
            if (error || data.error) throw new Error(`Error creando orden ${i}: ${JSON.stringify(data?.error || error)}`);
            localStockState[variant.id] -= quantity;
            createdOrders.push({ id: data.orderId, items: orderItems });
        }
        await verifyAllStock("Post-Creación");

        // 3. MODIFICAR ÓRDENES
        log("FASE 3: MODIFICANDO 10 ÓRDENES");
        for(const order of createdOrders) {
            const modifiedItems = JSON.parse(JSON.stringify(order.items));
            const modification = 5; // Aumentar cantidad en 5
            localStockState[modifiedItems[0].variantId] -= modification;
            modifiedItems[0].quantity += modification;
            const total = modifiedItems.reduce((acc, item) => acc + item.quantity, 0);

            const { data, error } = await supabase.rpc('update_order_transactional', { p_order_id: order.id, p_order_payload: { items: modifiedItems, total, tenantId } });
            if (error || data.error) throw new Error(`Error modificando orden ${order.id}: ${JSON.stringify(data?.error || error)}`);
            order.items = modifiedItems; // Actualizar el estado local de la orden
        }
        await verifyAllStock("Post-Modificación");

        // 4. ELIMINAR ÓRDENES
        log("FASE 4: ELIMINANDO 5 ÓRDENES");
        const ordersToDelete = createdOrders.slice(0, 5);
        for(const order of ordersToDelete) {
            localStockState[order.items[0].variantId] += order.items[0].quantity;
            const { data, error } = await supabase.rpc('delete_order_transactional', { p_order_id: order.id });
            if (error || data.error) throw new Error(`Error eliminando orden ${order.id}: ${JSON.stringify(data?.error || error)}`);
        }
        await verifyAllStock("Post-Eliminación");

        console.log("\n\n✅✅✅ PRUEBA DE MEDIANA COMPLEJIDAD COMPLETADA CON ÉXITO ✅✅✅");

    } catch (e) {
        console.error(`\n\n❌❌❌ PRUEBA FALLIDA: ${e.message} ❌❌❌`);
    } finally {
        log("FASE 5: LIMPIEZA FINAL");
        const orderIds = createdOrders.map(o => o.id);
        if (orderIds.length > 0) {
           await supabaseAdmin.from('order_items').delete().in('order_id', orderIds);
           await supabaseAdmin.from('orders').delete().in('order_id', orderIds);
        }
        await supabaseAdmin.from('product_variants').delete().like('code', 'MCT%');
        console.log("Datos de prueba eliminados.");
    }
}

runMediumComplexityTest();
