const supabase = require('../config/supabaseClient');

const getProducts = async (req, res) => {
  // Lógica de paginación y filtros similar al mock
  const { page = 1, rowsPerPage = 10, search, category } = req.query;
  const limit = rowsPerPage;
  const offset = (page - 1) * limit;

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

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      items: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
      }
    });
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
        const { variants, ...productData } = req.body;
        // Asumimos tenant_id viene del middleware de autenticación
        productData.tenant_id = 'a1b2c3d4-e5f6-7890-1234-567890abcdef';

        const { data: newProduct, error: productError } = await supabase
            .from('products')
            .insert(productData)
            .select()
            .single();

        if (productError) throw productError;

        if (variants && variants.length > 0) {
            for (const variant of variants) {
                const { prices, ...variantData } = variant;
                variantData.product_id = newProduct.id;
                variantData.tenant_id = newProduct.tenant_id;

                const { data: newVariant, error: variantError } = await supabase
                    .from('product_variants')
                    .insert(variantData)
                    .select()
                    .single();

                if (variantError) throw variantError;

                if (prices && prices.length > 0) {
                    const priceData = prices.map(p => ({
                        ...p,
                        variant_id: newVariant.id,
                        tenant_id: newProduct.tenant_id
                    }));
                    const { error: priceError } = await supabase.from('variant_prices').insert(priceData);
                    if (priceError) throw priceError;
                }
            }
        }
        
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { variants, ...productData } = req.body;

        const { data: updatedProduct, error: productError } = await supabase
            .from('products')
            .update(productData)
            .eq('id', id)
            .select()
            .single();
        
        if (productError) throw productError;
        if (!updatedProduct) return res.status(404).json({ error: 'Producto no encontrado' });

        // Aquí la lógica para actualizar/crear/eliminar variantes y precios sería más compleja.
        // Por simplicidad, esta implementación básica no maneja la actualización anidada profunda.
        // Se requeriría una función RPC o una lógica más detallada aquí.

        res.json(updatedProduct);
    } catch (error) {
        res.status(500).json({ error: error.message });
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
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
