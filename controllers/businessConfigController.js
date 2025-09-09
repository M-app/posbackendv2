const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

const getBusinessConfig = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { data, error } = await supabaseAdmin
            .from('business_config')
            .select('*')
            .eq('tenant_id', tenant_id)
            .single();

        if (error && error.code === 'PGRST116') {
            // No se encontró ninguna configuración, lo cual es un estado válido.
            // Se puede devolver un objeto vacío o un 404, dependiendo del frontend.
            return res.status(200).json(null); 
        }
        if (error) throw error;
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const updateBusinessConfig = async (req, res) => {
    try {
        const configData = req.body;
        const tenant_id = req.user.tenant_id;
        configData.tenant_id = tenant_id;

        // "Upsert" para crear la configuración si no existe, o actualizarla si ya existe.
        const { data, error } = await supabaseAdmin
            .from('business_config')
            .upsert(configData, { onConflict: 'tenant_id' })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    getBusinessConfig,
    updateBusinessConfig
};
