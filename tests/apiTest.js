require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURACIÓN ---
const API_BASE_URL = 'http://localhost:3001/api';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: Variables de entorno de Supabase no encontradas.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // Corregido: tenantId definido
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
    const variantIds = testVariants.map(v => v.id);
    const { data: dbVariants, error: dbError } = await supabase.from('product_variants').select('id, title, stock').in('id', variantIds);
    if(dbError) throw new Error(`Error de BD al verificar stock: ${dbError.message}`);

    for (const variant of dbVariants) {
        const expected = localStockState[variant.id];
        const real = variant.stock;
        comparison[variant.title] = { DB_Stock: real, Local_Stock: expected, Match: real === expected ? '✅ OK' : '❌ FALLO' };
        if (real !== expected) allOk = false;
    }

    console.table(comparison);
    if (!allOk) throw new Error(`Fallo en la verificación de stock en el paso: ${step}`);
    console.log(`✅ Verificación de stock [${step}] completada con éxito.`);
    return true;
};


// --- FASES DE PRUEBA ---
async function runApiTest() {
    log("INICIANDO PRUEBA DE API (END-TO-END)");
    let createdOrders = [];

    try {
        // 1. SETUP - Directamente en la BD para tener un estado conocido
        log("FASE 1: SETUP");
        await supabaseAdmin.from('product_variants').delete().like('code', 'API_TEST%');
        const productInfos = [
            { title: "API Test A", code: "API_TEST_A", stock: 100 },
            { title: "API Test B", code: "API_TEST_B", stock: 100 }
        ];
        for (const info of productInfos) {
            const { data: v, error } = await supabaseAdmin.from('product_variants').insert({...info, tenant_id: tenantId}).select().single();
            if(error) throw new Error(`Error en Setup: ${error.message}`);
            testVariants.push(v);
            localStockState[v.id] = v.stock;
        }

        // 2. CREAR ÓRDENES VÍA API
        log("FASE 2: CREANDO 2 ÓRDENES VÍA API");
        for(let i=0; i<2; i++){
            const variant = testVariants[i];
            const quantity = 10;
            const orderItems = [{ variantId: variant.id, quantity, price: 1, name: variant.title, variantTitle: variant.title }];
            const payload = { items: orderItems, total: 10, tenantId }; // Añadido tenantId al payload
            
            const response = await axios.post(`${API_BASE_URL}/orders/checkout`, payload);
            if (response.status !== 201 || response.data.error) throw new Error(`Error en API al crear orden: ${JSON.stringify(response.data?.error)}`);
            
            localStockState[variant.id] -= quantity;
            createdOrders.push({ id: response.data.orderId, items: orderItems });
        }
        await verifyAllStock("Post-Creación API");

        // 3. MODIFICAR ÓRDENES VÍA API
        log("FASE 3: MODIFICANDO 2 ÓRDENES VÍA API");
        for(const order of createdOrders) {
            const modifiedItems = JSON.parse(JSON.stringify(order.items));
            const modification = 5;
            localStockState[modifiedItems[0].variantId] -= modification;
            modifiedItems[0].quantity += modification;
            const total = modifiedItems.reduce((acc, item) => acc + item.quantity, 0);

            const response = await axios.put(`${API_BASE_URL}/orders/${order.id}`, { items: modifiedItems, total, tenantId }); // Añadido tenantId al payload
            if (response.status !== 200 || response.data.error) throw new Error(`Error en API al modificar orden ${order.id}: ${JSON.stringify(response.data?.error)}`);
            order.items = modifiedItems;
        }
        await verifyAllStock("Post-Modificación API");

        // 4. ELIMINAR ÓRDENES VÍA API
        log("FASE 4: ELIMINANDO 1 ORDEN VÍA API");
        const orderToDelete = createdOrders[0];
        localStockState[orderToDelete.items[0].variantId] += orderToDelete.items[0].quantity;
        const response = await axios.delete(`${API_BASE_URL}/orders/${orderToDelete.id}`);
        if (response.status !== 200 || response.data.error) throw new Error(`Error en API al eliminar orden ${orderToDelete.id}: ${JSON.stringify(response.data?.error)}`);
        
        await verifyAllStock("Post-Eliminación API");

        console.log("\n\n✅✅✅ PRUEBA DE API COMPLETADA CON ÉXITO ✅✅✅");

    } catch (e) {
        if(axios.isAxiosError(e)) {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: Error de API - ${e.message} ❌❌❌`);
            console.error("Detalles:", e.response?.data);
        } else {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: ${e.message} ❌❌❌`);
        }
    } finally {
        log("FASE 5: LIMPIEZA FINAL");
        // Corregido: usar supabaseAdmin para la limpieza
        await supabaseAdmin.from('product_variants').delete().like('code', 'API_TEST%');
        const orderIds = createdOrders.map(o => o.id);
        if(orderIds.length > 0) await supabaseAdmin.from('orders').delete().in('id', orderIds);
    }
}

runApiTest();
