require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

// --- CONFIGURACIÓN ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Error: Asegúrate de que las variables de entorno de Supabase están en tu .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

const TEST_PRODUCTS = [
  { name: 'Test Product A', code: 'TPA01', stock: 1000 },
  { name: 'Test Product B', code: 'TPB01', stock: 1000 },
  { name: 'Test Product C', code: 'TPC01', stock: 1000 },
  { name: 'Test Product D', code: 'TPD01', stock: 1000 },
  { name: 'Test Product E', code: 'TPE01', stock: 1000 },
];

let productsInDB = [];
let localStockState = {};

// --- HELPERS ---
const log = (phase, message, data = '') => {
  console.log(`\n[${phase}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

// --- FASES DE LA PRUEBA ---

async function phase1_seedData() {
    log('FASE 1: SIEMBRA', 'Asegurando el estado inicial de los datos de prueba (Upsert)...');

    // Estrategia de Upsert para evitar errores de duplicados
    const { data: category, error: catError } = await supabaseAdmin
        .from('categories')
        .upsert({ name: 'Test Category', tenant_id: tenantId }, { onConflict: 'name, tenant_id' })
        .select().single();
    if (catError) throw new Error(`Error con categoría de prueba: ${catError.message}`);

    const { data: product, error: prodError } = await supabaseAdmin
        .from('products')
        .upsert({ name: 'Test Products Container', tenant_id: tenantId, category_id: category.id }, { onConflict: 'name, tenant_id' })
        .select().single();
    if (prodError) throw new Error(`Error con producto contenedor de prueba: ${prodError.message}`);

    // Limpiar órdenes antiguas para no afectar el stock
    const {data: oldOrders} = await supabase.from('orders').select('id').ilike('status', '%test%');
    if(oldOrders && oldOrders.length > 0) {
        await supabaseAdmin.from('order_items').delete().in('order_id', oldOrders.map(o => o.id));
        await supabaseAdmin.from('orders').delete().in('id', oldOrders.map(o => o.id));
    }


    for (const p of TEST_PRODUCTS) {
        const { data: variant, error } = await supabaseAdmin.from('product_variants').upsert({
            product_id: product.id,
            code: p.code,
            title: p.name,
            stock: p.stock, // Siempre reseteamos el stock a 1000
            tenant_id: tenantId
        }, { onConflict: 'code' }).select().single();
        
        if (error) throw new Error(`Error haciendo upsert en la variante ${p.code}: ${error.message}`);
        productsInDB.push(variant);
        localStockState[variant.id] = p.stock;
    }
    log('FASE 1: SIEMBRA', 'Datos iniciales asegurados. Estado del stock local:', localStockState);
}


// ... (El resto de las funciones de fase permanecen igual) ...

async function phase2_createOrders(orderCount = 50) {
    log('FASE 2: CREACIÓN', `Creando ${orderCount} órdenes...`);
    let createdOrders = [];

    for (let i = 0; i < orderCount; i++) {
        const itemsInOrder = Math.floor(Math.random() * 3) + 1;
        let orderItems = [];
        let orderTotal = 0;
        
        for (let j = 0; j < itemsInOrder; j++) {
            const product = productsInDB[Math.floor(Math.random() * productsInDB.length)];
            const quantity = Math.floor(Math.random() * 5) + 1;
            const price = 10;

            if (localStockState[product.id] >= quantity) {
                orderItems.push({
                    variantId: product.id,
                    quantity: quantity,
                    price: price,
                    name: product.title,
                    variantTitle: product.title
                });
                localStockState[product.id] -= quantity;
                orderTotal += quantity * price;
            }
        }

        if (orderItems.length > 0) {
            const { data, error } = await supabase.rpc('process_order', {
                order_payload: { items: orderItems, total: orderTotal, tenantId, status: 'test_order' }
            });

            if (error || (data && data.error)) {
                log('FASE 2: CREACIÓN', 'ERROR al crear orden.', { error, data });
                throw new Error(`Fallo en la creación de orden: ${JSON.stringify(data?.error)}`);
            }
            createdOrders.push({ id: data.orderId, items: orderItems });
        }
    }
    log('FASE 2: CREACIÓN', 'Órdenes creadas. Estado del stock local:', localStockState);
    return createdOrders;
}

async function phase3_modifyOrders(orders) {
    log('FASE 3: MODIFICACIÓN', `Modificando ${orders.length} órdenes...`);
    for (const order of orders) {
        let newItems = JSON.parse(JSON.stringify(order.items)); // Clonar
        let newTotal = 0;

        const modType = Math.random();
        if (modType < 0.33 && newItems.length > 1) { // Reducir cantidad
            const itemToChange = newItems[0];
            const reduction = Math.floor(itemToChange.quantity / 2) || 1;
            localStockState[itemToChange.variantId] += reduction;
            itemToChange.quantity -= reduction;
        } else if (modType < 0.66) { // Aumentar cantidad
            const itemToChange = newItems[0];
            const addition = Math.floor(Math.random() * 3) + 1;
            if (localStockState[itemToChange.variantId] >= addition) {
                localStockState[itemToChange.variantId] -= addition;
                itemToChange.quantity += addition;
            }
        } else { // Añadir un producto nuevo
            const product = productsInDB[Math.floor(Math.random() * productsInDB.length)];
            const quantity = Math.floor(Math.random() * 5) + 1;
            if (localStockState[product.id] >= quantity) {
                newItems.push({ variantId: product.id, quantity, price: 10, name: product.title, variantTitle: product.title });
                localStockState[product.id] -= quantity;
            }
        }
        
        newTotal = newItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
        
        const { data, error } = await supabase.rpc('update_order_transactional', {
            p_order_id: order.id,
            p_order_payload: { items: newItems, total: newTotal, tenantId }
        });

        if (error || (data && data.error)) {
           // No hacer nada, la transacción falló
        } else {
             order.items = newItems; 
        }
    }
    log('FASE 3: MODIFICACIÓN', 'Órdenes modificadas. Estado del stock local:', localStockState);
}

async function phase4_deleteOrders(orders) {
    log('FASE 4: ELIMINACIÓN', `Eliminando ${orders.length} órdenes...`);
    for (const order of orders) {
        for (const item of order.items) {
             localStockState[item.variantId] += item.quantity;
        }

        const { data, error } = await supabase.rpc('delete_order_transactional', { p_order_id: order.id });

        if (error || (data && data.error)) {
            log('FASE 4: ELIMINACIÓN', 'ERROR al eliminar orden.', { error, data });
            throw new Error(`Fallo en la eliminación de orden: ${JSON.stringify(data?.error)}`);
        }
    }
    log('FASE 4: ELIMINACIÓN', 'Órdenes eliminadas. Estado del stock local:', localStockState);
}

async function phase5_verify() {
    log('FASE 5: VERIFICACIÓN', 'Comparando stock real de la BD con el estado local...');
    let success = true;

    const { data: dbVariants, error } = await supabase.from('product_variants').select('*').in('id', productsInDB.map(p => p.id));
    if (error) throw error;
    
    let comparison = {};

    for (const variant of dbVariants) {
        comparison[variant.title] = {
            DB_Stock: variant.stock,
            Local_Stock: localStockState[variant.id],
            Match: variant.stock === localStockState[variant.id] ? '✅ OK' : '❌ FALLO'
        };
        if (variant.stock !== localStockState[variant.id]) {
            success = false;
        }
    }

    console.table(comparison);

    if (success) {
        console.log("\n✅ ✅ ✅ ¡Prueba completada con éxito! El inventario es consistente. ✅ ✅ ✅");
    } else {
        console.error("\n❌ ❌ ❌ ¡Prueba fallida! Hay inconsistencias en el inventario. ❌ ❌ ❌");
    }
}

async function runTest() {
  try {
    await phase1_seedData();
    const createdOrders = await phase2_createOrders(70);
    
    const ordersToModify = createdOrders.slice(0, 20);
    const ordersToDelete = createdOrders.slice(20, 35);
    
    await phase3_modifyOrders(ordersToModify);
    await phase4_deleteOrders(ordersToDelete);

    await phase5_verify();

  } catch (err) {
    console.error('\n🛑 La prueba fue detenida debido a un error:', err.message);
  }
}

runTest();
