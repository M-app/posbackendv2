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
let testVariant;

// --- HELPERS ---
const log = (message) => console.log(`\n--- ${message} ---`);

const verifyStock = async (expectedStock, step) => {
    const { data, error } = await supabaseAdmin.from('product_variants').select('stock').eq('id', testVariant.id).single();
    if (error) throw new Error(`Error al verificar stock: ${error.message}`);

    if (data.stock === expectedStock) {
        console.log(`✅ [${step}] Verificación exitosa. Esperado: ${expectedStock}, Real: ${data.stock}`);
    } else {
        throw new Error(`❌ [${step}] FALLO. Esperado: ${expectedStock}, Real: ${data.stock}`);
    }
};

// --- PRUEBA ---
async function runInventoryApiTest() {
    log("INICIANDO PRUEBA DE API DE INVENTARIO");
    let entradaRecordId, salidaRecordId;

    try {
        // 1. SETUP
        log("FASE 1: SETUP");
        await supabaseAdmin.from('product_variants').delete().eq('code', 'INV_API_TEST');
        const { data: v, error } = await supabaseAdmin.from('product_variants').insert({ code: 'INV_API_TEST', title: 'Inventory API Test', stock: 1000, tenant_id: tenantId }).select().single();
        if (error) throw new Error(`Error en Setup: ${error.message}`);
        testVariant = v;
        await verifyStock(1000, "Setup Inicial");

        // 2. PRUEBA DE ENTRADA
        log("FASE 2: Creando registro de ENTRADA (+100)");
        let payload = { type: 'entrada', description: 'Compra', items: [{ variantId: testVariant.id, quantity: 100 }] };
        const entradaResponse = await axios.post(`${API_BASE_URL}/inventory/records`, payload);
        if (entradaResponse.status !== 201) throw new Error("La creación de entrada falló");
        entradaRecordId = entradaResponse.data.recordId;
        await verifyStock(1100, "Post-Entrada");

        // 3. PRUEBA DE SALIDA
        log("FASE 3: Creando registro de SALIDA (-50)");
        payload = { type: 'salida', description: 'Ajuste', items: [{ variantId: testVariant.id, quantity: 50 }] };
        const salidaResponse = await axios.post(`${API_BASE_URL}/inventory/records`, payload);
        if (salidaResponse.status !== 201) throw new Error("La creación de salida falló");
        salidaRecordId = salidaResponse.data.recordId;
        await verifyStock(1050, "Post-Salida");

        // 4. PRUEBA DE SALIDA INVÁLIDA
        log("FASE 4: Intentando SALIDA con stock insuficiente (-2000)");
        try {
            payload = { type: 'salida', description: 'Error', items: [{ variantId: testVariant.id, quantity: 2000 }] };
            await axios.post(`${API_BASE_URL}/inventory/records`, payload);
        } catch (e) {
            if (e.response.status === 400 && e.response.data.error === 'Stock insuficiente') {
                console.log("✅ Se recibió el error de stock insuficiente esperado.");
            } else { throw new Error("No se recibió el error de stock insuficiente esperado."); }
        }
        await verifyStock(1050, "Post-Salida Inválida (sin cambios)");

        // 5. PRUEBA DE ACTUALIZACIÓN
        log("FASE 5: Actualizando ENTRADA de 100 a 120 (+20)");
        payload = { type: 'entrada', description: 'Compra Corregida', items: [{ variantId: testVariant.id, quantity: 120 }] };
        await axios.put(`${API_BASE_URL}/inventory/records/${entradaRecordId}`, payload);
        await verifyStock(1070, "Post-Actualización");
        
        // 6. PRUEBA DE ELIMINACIÓN
        log("FASE 6: Eliminando SALIDA de 50 (devuelve 50)");
        await axios.delete(`${API_BASE_URL}/inventory/records/${salidaRecordId}`);
        await verifyStock(1120, "Post-Eliminación");

        console.log("\n\n✅✅✅ PRUEBA DE API DE INVENTARIO COMPLETADA CON ÉXITO ✅✅✅");

    } catch (e) {
        if (axios.isAxiosError(e)) {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: Error de API - ${e.message} ❌❌❌`, e.response?.data);
        } else {
            console.error(`\n\n❌❌❌ PRUEBA FALLIDA: ${e.message} ❌❌❌`);
        }
    } finally {
        log("FASE FINAL: LIMPIEZA");
        if(entradaRecordId) await supabaseAdmin.from('inventory_records').delete().eq('id', entradaRecordId);
        if(salidaRecordId) await supabaseAdmin.from('inventory_records').delete().eq('id', salidaRecordId);
        if(testVariant) await supabaseAdmin.from('product_variants').delete().eq('id', testVariant.id);
    }
}

runInventoryApiTest();
