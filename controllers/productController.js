const supabase = require('../config/supabaseClient');

const getProducts = async (req, res) => {
  // Lógica de paginación y filtros similar al mock
  const { page = 1, rowsPerPage = 10, search, category, sortBy, descending } = req.query;
  const pageNum = parseInt(page, 10) || 1;
  const requestedLimit = parseInt(rowsPerPage, 10);
  const fetchAll = requestedLimit === 0; // rowsPerPage=0 => traer todo
  const limit = fetchAll ? null : (Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 10);
  const offset = fetchAll ? 0 : (pageNum - 1) * limit;

  try {
    let query = supabase
      .from('products')
      .select(`
        *,
        category:categories(name),
        variants:product_variants (
          *,
          prices:variant_prices(*)
        )
      `, { count: 'exact' });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (category) {
      query = query.eq('category_id', category);
    }

    // Ordenamiento opcional
    const validSorts = new Set(['name', 'description', 'created_at']);
    const sortKey = validSorts.has(sortBy) ? sortBy : 'name';
    const isDescending = String(descending).toLowerCase() === 'true';
    query = query.order(sortKey, { ascending: !isDescending });

    if (!fetchAll) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const effectiveLimit = fetchAll ? (data?.length || 0) : limit;
    res.json({
      items: data,
      pagination: {
        page: fetchAll ? 1 : pageNum,
        limit: effectiveLimit,
        total: count,
        pages: fetchAll ? 1 : Math.ceil(count / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Endpoint liviano optimizado para página de órdenes (solo lo necesario)
const getOrderProducts = async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from('products')
      .select(`
        id,
        name,
        category:categories(name),
        variants:product_variants(
          id,
          code,
          title,
          enabled,
          stock,
          prices:variant_prices(name, value, min_quantity)
        )
      `);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    // Orden básico por nombre
    query = query.order('name', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    // Sin paginación; respuesta directa optimizada
    res.json({ items: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const { data: product, error } = await supabase
            .from('products')
            .select(`
                *,
                category:categories(name),
                variants:product_variants (
                    *,
                    prices:variant_prices(*)
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

        res.json(product);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const createProduct = async (req, res) => {
    try {
        const { variants, category, inventory, tenantId, ...productDetails } = req.body;
        
        // 1. Buscar el ID de la categoría
        let categoryId = null;
        if (category) {
            const { data: categoryData, error: categoryError } = await supabase
                .from('categories')
                .select('id')
                .eq('name', category)
                .single();
            
            if (categoryError || !categoryData) {
                return res.status(400).json({ error: `La categoría '${category}' no fue encontrada.` });
            }
            categoryId = categoryData.id;
        }

        const productData = {
            ...productDetails,
            category_id: categoryId,
            tenant_id: 'a1b2c3d4-e5f6-7890-1234-567890abcdef' // TODO: Sacar de auth
        };

        // 2. Insertar el producto principal
        const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert(productData)
            .select()
            .single();

        if (productError) throw productError;

        // 3. Procesar variantes y sus precios
        if (variants && variants.length > 0) {
            for (const variant of variants) {
                // a. Preparar datos para product_variants
                const { detalle, semi, mayoreo, ...variantDetails } = variant;
                const variantData = {
                    ...variantDetails,
                    product_id: newProduct.id,
                    tenant_id: newProduct.tenant_id,
                };

                // b. Insertar la variante y obtener su ID
                const { data: newVariant, error: variantError } = await supabase
                    .from('product_variants')
                    .insert(variantData)
                    .select('id')
                    .single();

                if (variantError) throw variantError;

                // c. Preparar los datos de precios para variant_prices
                const pricesData = [
                    { name: 'detalle', value: detalle, min_quantity: 1, variant_id: newVariant.id, tenant_id: newProduct.tenant_id },
                    { name: 'semi', value: semi, min_quantity: 10, variant_id: newVariant.id, tenant_id: newProduct.tenant_id },
                    { name: 'mayoreo', value: mayoreo, min_quantity: 20, variant_id: newVariant.id, tenant_id: newProduct.tenant_id }
                ];

                // d. Insertar los precios
                const { error: priceError } = await supabase.from('variant_prices').insert(pricesData);
                if (priceError) throw priceError;
            }
        }
        
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id: productId } = req.params;
        const { variants, category, ...productDetails } = req.body;
        const tenantId = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'; // TODO: Sacar de auth

        // 1. Buscar el ID de la categoría si se proporcionó
        let categoryId = productDetails.category_id;
        if (category && typeof category === 'string') {
            const { data: categoryData, error: categoryError } = await supabase
                .from('categories').select('id').eq('name', category).single();
            if (categoryError || !categoryData) return res.status(400).json({ error: `La categoría '${category}' no fue encontrada.` });
            categoryId = categoryData.id;
        }

        // 2. Actualizar los datos del producto principal
        const { data: updatedProduct, error: productError } = await supabase
            .from('products')
            .update({ name: productDetails.name, description: productDetails.description, category_id: categoryId })
            .eq('id', productId)
            .select()
            .single();

        if (productError) throw productError;
        if (!updatedProduct) return res.status(404).json({ error: 'Producto no encontrado' });

        // 3. Sincronizar variantes y precios
        if (variants && variants.length > 0) {
            for (const variant of variants) {
                const { id: variantId, detalle, semi, mayoreo, ...variantData } = variant;

                // a. Preparar datos para la tabla 'product_variants'
                const variantToUpsert = {
                    ...variantData,
                    id: variantId, // Importante para el upsert
                    product_id: productId,
                    tenant_id: tenantId,
                };
                
                // b. Hacer Upsert en 'product_variants'
                const { error: variantError } = await supabase.from('product_variants').upsert(variantToUpsert);
                if (variantError) throw variantError;

                // c. Preparar datos de precios
                const pricesToUpsert = [
                    { name: 'detalle', value: detalle, min_quantity: 1, variant_id: variantId, tenant_id: tenantId },
                    { name: 'semi', value: semi, min_quantity: 10, variant_id: variantId, tenant_id: tenantId },
                    { name: 'mayoreo', value: mayoreo, min_quantity: 20, variant_id: variantId, tenant_id: tenantId }
                ];

                // d. Hacer Upsert en 'variant_prices'
                const { error: priceError } = await supabase.from('variant_prices').upsert(pricesToUpsert, { onConflict: 'variant_id,name' });
                if (priceError) throw priceError;
            }
        }
        
        // Opcional: Manejar eliminación de variantes que ya no vienen del frontend
        // ... (lógica más compleja, omitida por ahora)

        res.json(updatedProduct);
    } catch (error) {
        console.error('Error al actualizar el producto:', error);
        res.status(500).json({ error: 'Error interno del servidor al actualizar el producto.', details: error.message });
    }
};

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};


module.exports = {
  getProducts,
  getOrderProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
