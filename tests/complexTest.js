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

// --- HELPERS ---
const log = (message) => console.log(`\n${message}`);
const verifyStock = async (variantId, expectedStock, step) => {
    const { data, error } = await supabase.from('product_variants').select('stock').eq('id', variantId).single();
    if (error) throw new Error(`Error al verificar stock en paso "${step}": ${error.message}`);

    if (data.stock === expectedStock) {
        console.log(`✅ [${step}] Verificación de stock exitosa. Esperado: ${expectedStock}, Real: ${data.stock}`);
    } else {
        throw new Error(`❌ [${step}] FALLO EN VERIFICACIÓN DE STOCK. Esperado: ${expectedStock}, Real: ${data.stock}`);
    }
    return true;
};

// --- CICLO DE VIDA DE PRUEBA ---
async function testOrderLifecycle(testName, productInfos) {
    log(`--- INICIANDO PRUEBA DE CICLO DE VIDA: "${testName}" ---`);
    let initialStocks = {};
    let variants = [];
    let orderId;

    try {
        // 1. SETUP: Crear productos y registrar stock inicial
        log(`[${testName}] 1. Creando productos de prueba...`);
        for (const info of productInfos) {
            await supabaseAdmin.from('product_variants').delete().eq('code', info.code);
            const { data: variant, error } = await supabaseAdmin.from('product_variants').insert({
                code: info.code,
                title: info.name,
                stock: info.initialStock,
                tenant_id: tenantId
            }).select().single();
            if (error) throw new Error(`Setup fallido: ${error.message}`);
            variants.push({ ...variant, orderQuantity: info.orderQuantity });
            initialStocks[variant.id] = info.initialStock;
        }

        // 2. CREAR ORDEN
        log(`[${testName}] 2. Creando orden...`);
        let orderItems = variants.map(v => ({ variantId: v.id, quantity: v.orderQuantity, price: 1, name: v.title, variantTitle: v.title }));
        let total = orderItems.reduce((acc, item) => acc + item.quantity, 0);
        const { data: rpcCreate, error: rpcCreateError } = await supabase.rpc('process_order', {
            order_payload: { items: orderItems, total, tenantId }
        });
        if (rpcCreateError || (rpcCreate && rpcCreate.error)) throw new Error(`Error al crear orden: ${JSON.stringify(rpcCreate?.error || rpcCreateError)}`);
        orderId = rpcCreate.orderId;
        console.log(`Orden creada con ID: ${orderId}`);
        for(const v of variants) await verifyStock(v.id, initialStocks[v.id] - v.orderQuantity, "Post-Creación");
        
        // 3. MODIFICAR ORDEN (Aumentar cantidad)
        log(`[${testName}] 3. Modificando orden (Aumentando cantidad)...`);
        let modifiedItemsUp = JSON.parse(JSON.stringify(orderItems));
        modifiedItemsUp.forEach(item => item.quantity += 5); // Aumentar en 5
        total = modifiedItemsUp.reduce((acc, item) => acc + item.quantity, 0);
        const { data: rpcUpdateUp, error: rpcUpdateUpError } = await supabase.rpc('update_order_transactional', {
            p_order_id: orderId,
            p_order_payload: { items: modifiedItemsUp, total, tenantId }
        });
        if (rpcUpdateUpError || (rpcUpdateUp && rpcUpdateUp.error)) throw new Error(`Error al modificar (subir): ${JSON.stringify(rpcUpdateUp?.error || rpcUpdateUpError)}`);
        for(const v of variants) await verifyStock(v.id, initialStocks[v.id] - v.orderQuantity - 5, "Post-Modificación (Subida)");
        orderItems = modifiedItemsUp; // Guardar el estado actual

        // 4. MODIFICAR ORDEN (Disminuir cantidad)
        log(`[${testName}] 4. Modificando orden (Disminuyendo cantidad)...`);
        let modifiedItemsDown = JSON.parse(JSON.stringify(orderItems));
        modifiedItemsDown.forEach(item => item.quantity -= 10); // Bajar en 10
        total = modifiedItemsDown.reduce((acc, item) => acc + item.quantity, 0);
         const { data: rpcUpdateDown, error: rpcUpdateDownError } = await supabase.rpc('update_order_transactional', {
            p_order_id: orderId,
            p_order_payload: { items: modifiedItemsDown, total, tenantId }
        });
        if (rpcUpdateDownError || (rpcUpdateDown && rpcUpdateDown.error)) throw new Error(`Error al modificar (bajar): ${JSON.stringify(rpcUpdateDown?.error || rpcUpdateDownError)}`);
        for(const v of variants) await verifyStock(v.id, initialStocks[v.id] - v.orderQuantity - 5 + 10, "Post-Modificación (Bajada)");
        orderItems = modifiedItemsDown;

        // 5. ELIMINAR ORDEN
        log(`[${testName}] 5. Eliminando orden...`);
        const { data: rpcDelete, error: rpcDeleteError } = await supabase.rpc('delete_order_transactional', { p_order_id: orderId });
        if (rpcDeleteError || (rpcDelete && rpcDelete.error)) throw new Error(`Error al eliminar: ${JSON.stringify(rpcDelete?.error || rpcDeleteError)}`);
        for(const v of variants) await verifyStock(v.id, initialStocks[v.id], "Post-Eliminación (Stock Restaurado)");

        console.log(`✅✅✅ PRUEBA "${testName}" COMPLETADA CON ÉXITO ✅✅✅`);
    } catch (e) {
        console.error(`❌❌❌ PRUEBA "${testName}" FALLIDA: ${e.message} ❌❌❌`);
    } finally {
        // Limpieza final
        if(orderId) {
            await supabaseAdmin.from('order_items').delete().eq('order_id', orderId);
            await supabaseAdmin.from('orders').delete().eq('id', orderId);
        }
        for(const v of variants) await supabaseAdmin.from('product_variants').delete().eq('id', v.id);
    }
}

async function runComplexTests() {
    await testOrderLifecycle(
        "1 Producto, 1 Orden",
        [
            { name: "Complex Test A", code: "CTA01", initialStock: 100, orderQuantity: 10 }
        ]
    );

    await testOrderLifecycle(
        "2 Productos, 1 Orden",
        [
            { name: "Complex Test B", code: "CTB01", initialStock: 200, orderQuantity: 15 },
            { name: "Complex Test C", code: "CTC01", initialStock: 300, orderQuantity: 25 }
        ]
    );
}

runComplexTests();
