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

async function runSimpleTest() {
    console.log("--- Iniciando Prueba Simple de Transacción ---");

    // 1. SETUP: Asegurar que el producto de prueba existe y tiene stock conocido
    const testVariantCode = 'SIMPLE_TEST_01';
    await supabaseAdmin.from('product_variants').delete().eq('code', testVariantCode);
    const { data: variant, error: variantError } = await supabaseAdmin.from('product_variants').insert({
        code: testVariantCode,
        title: 'Simple Test Product',
        stock: 500,
        tenant_id: tenantId
    }).select().single();

    if (variantError) {
        console.error("Error en Setup:", variantError.message);
        return;
    }
    console.log(`Stock Inicial de ${variant.title}: ${variant.stock}`);

    // 2. ACCIÓN: Crear una orden simple
    const orderQuantity = 10;
    const orderPayload = {
        items: [{
            variantId: variant.id,
            quantity: orderQuantity,
            price: 1,
            name: 'Simple Test',
            variantTitle: 'Simple Test'
        }],
        total: orderQuantity,
        tenantId
    };

    console.log(`Creando orden para descontar ${orderQuantity} unidades...`);
    const { data: rpcData, error: rpcError } = await supabase.rpc('process_order', {
        order_payload: orderPayload
    });

    if (rpcError || (rpcData && rpcData.error)) {
        console.error("Error al procesar la orden:", rpcError || rpcData.error);
        return;
    }
    console.log("Orden creada con éxito. ID:", rpcData.orderId);

    // 3. VERIFICACIÓN: Leer el stock final
    const { data: finalVariant, error: finalError } = await supabase.from('product_variants').select('stock').eq('id', variant.id).single();

    if (finalError) {
        console.error("Error al leer stock final:", finalError.message);
        return;
    }
    console.log(`Stock Final de ${variant.title}: ${finalVariant.stock}`);
    
    // 4. RESULTADO
    const expectedStock = variant.stock - orderQuantity;
    if (finalVariant.stock === expectedStock) {
        console.log(`\n✅ ✅ ✅ ¡Prueba simple exitosa! El stock es consistente. (${expectedStock}) ✅ ✅ ✅`);
    } else {
        console.error(`\n❌ ❌ ❌ ¡Prueba simple fallida! Stock esperado: ${expectedStock}, Stock real: ${finalVariant.stock} ❌ ❌ ❌`);
    }

    // Limpieza
    await supabaseAdmin.from('order_items').delete().eq('order_id', rpcData.orderId);
    await supabaseAdmin.from('orders').delete().eq('id', rpcData.orderId);
    await supabaseAdmin.from('product_variants').delete().eq('id', variant.id);
}

runSimpleTest();
