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
const log = (message) => console.log(`\n--- ${message} ---`);

const verifyAllStock = async (step) => {
    log(`VERIFICANDO STOCK [${step}]`);
    await new Promise(res => setTimeout(res, 500)); // Pequeña pausa para asegurar consistencia de lectura
    let allOk = true;
    let comparison = {};
    const variantIds = testVariants.map(v => v.id);
    const { data: dbVariants, error: dbError } = await supabase.from('product_variants').select('id, title, stock').in('id', variantIds);
    if(dbError) throw new Error(`Error de BD al verificar stock: ${dbError.message}`);

    for (const variant of dbVariants) {
        const expected = localStockState[variant.id];
        const real = variant.stock;
        if (real !== expected) {
            allOk = false;
            comparison[variant.title] = { DB_Stock: real, Local_Stock: expected, Match: '❌ FALLO' };
        }
    }

    if (allOk) {
        console.log(`✅ Verificación de stock [${step}] completada con éxito.`);
    } else {
        console.table(comparison);
        throw new Error(`Fallo en la verificación de stock en el paso: ${step}`);
    }
    return true;
};


// --- FASES DE PRUEBA ---
async function runFinalStressTest() {
    log("INICIANDO PRUEBA DE ESTRÉS FINAL");
    let createdOrders = [];

    try {
        // 1. SETUP
        log("FASE 1: SETUP (20 Productos)");
        await supabaseAdmin.from('product_variants').delete().like('code', 'FST%');
        for (let i = 0; i < 20; i++) {
            const code = `FST${i.toString().padStart(2, '0')}`;
            const { data: v, error } = await supabaseAdmin.from('product_variants')
                .upsert({ code, title: `Final Stress Test ${i}`, stock: 5000, tenant_id: tenantId }, { onConflict: 'code' })
                .select().single();
            if (error) throw new Error(`Error en Setup para ${code}: ${error.message}`);
            testVariants.push(v);
            localStockState[v.id] = 5000;
        }
        console.log("20 productos de prueba listos.");

        // 2. CREAR ÓRDENES
        log("FASE 2: CREANDO 30 ÓRDENES (15-20 productos cada una)");
        for (let i = 0; i < 30; i++) {
            let orderItems = [];
            const shuffledVariants = [...testVariants].sort(() => 0.5 - Math.random());
            const itemCount = Math.floor(Math.random() * 6) + 15; // 15-20 productos por orden
            const selectedVariants = shuffledVariants.slice(0, itemCount);

            for (const variant of selectedVariants) {
                const quantity = Math.floor(Math.random() * 10) + 1; // 1-10 unidades
                if (localStockState[variant.id] >= quantity) {
                    orderItems.push({ variantId: variant.id, quantity, price: 1, name: variant.title, variantTitle: variant.title });
                    localStockState[variant.id] -= quantity;
                }
            }
            if(orderItems.length === 0) continue; // Si no se pudo añadir ningún item, saltar.

            const total = orderItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
            const { data, error } = await supabase.rpc('process_order', { order_payload: { items: orderItems, total, tenantId } });
            if (error || data.error) throw new Error(`Error creando orden ${i}: ${JSON.stringify(data?.error || error)}`);
            createdOrders.push({ id: data.orderId, items: orderItems });
        }
        await verifyAllStock("Post-Creación");

        // 3. MODIFICAR ÓRDENES
        log("FASE 3: MODIFICANDO 30 ÓRDENES (ALEATORIO)");
        for (const order of createdOrders) {
            let modifiedItems = JSON.parse(JSON.stringify(order.items));
            const modType = Math.random();

            if (modType < 0.5 && modifiedItems.length > 0) { // Modificar cantidad
                 const itemToChange = modifiedItems[0];
                 const change = (Math.floor(Math.random() * 6) + 1) - 3; // de -2 a +4
                 if (localStockState[itemToChange.variantId] >= change && (itemToChange.quantity + change > 0)) {
                     localStockState[itemToChange.variantId] -= change;
                     itemToChange.quantity += change;
                 }
            } else if (modifiedItems.length < 5) { // Añadir item
                const variant = testVariants[Math.floor(Math.random() * testVariants.length)];
                if (!modifiedItems.find(item => item.variantId === variant.id) && localStockState[variant.id] >= 5) {
                    modifiedItems.push({ variantId: variant.id, quantity: 5, price: 1, name: variant.title, variantTitle: variant.title });
                    localStockState[variant.id] -= 5;
                }
            } else if (modifiedItems.length > 1) { // Quitar item
                const itemToRemove = modifiedItems.pop();
                localStockState[itemToRemove.variantId] += itemToRemove.quantity;
            }

            const total = modifiedItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
            const { data, error } = await supabase.rpc('update_order_transactional', { p_order_id: order.id, p_order_payload: { items: modifiedItems, total, tenantId } });
            if (error || data.error) {
                 // Revertir estado local si la tx falla
                order.items.forEach(item => { localStockState[item.variantId] += item.quantity });
                modifiedItems.forEach(item => { localStockState[item.variantId] -= item.quantity });
            } else {
                order.items = modifiedItems;
            }
        }
        await verifyAllStock("Post-Modificación");

        // 4. ELIMINAR ÓRDENES
        log("FASE 4: ELIMINANDO 15 ÓRDENES");
        const ordersToDelete = createdOrders.slice(0, 15);
        for(const order of ordersToDelete) {
            order.items.forEach(item => { localStockState[item.variantId] += item.quantity });
            const { data, error } = await supabase.rpc('delete_order_transactional', { p_order_id: order.id });
            if (error || data.error) throw new Error(`Error eliminando orden ${order.id}: ${JSON.stringify(data?.error || error)}`);
        }
        await verifyAllStock("Post-Eliminación");

        console.log("\n\n✅✅✅ PRUEBA DE ESTRÉS FINAL COMPLETADA CON ÉXITO ✅✅✅");

    } catch (e) {
        console.error(`\n\n❌❌❌ PRUEBA FALLIDA: ${e.message} ❌❌❌`);
    } finally {
        log("FASE 5: LIMPIEZA FINAL");
        const orderIds = createdOrders.map(o => o.id);
        if (orderIds.length > 0) {
           await supabaseAdmin.from('order_items').delete().in('order_id', orderIds);
           await supabaseAdmin.from('orders').delete().in('order_id', orderIds);
        }
        await supabaseAdmin.from('product_variants').delete().like('code', 'FST%');
        console.log("Datos de prueba eliminados.");
    }
}

runFinalStressTest();
