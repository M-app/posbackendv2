const supabase = require('../config/supabaseClient');
const supabaseAdmin = require('../config/supabaseAdmin');

// Solo super admins pueden gestionar tenants
const getAllTenants = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * lim;

    let query = supabaseAdmin
      .from('tenants')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + lim - 1);

    if (error) throw error;

    res.json({
      items: data,
      pagination: {
        page: pageNum,
        limit: lim,
        total: count,
        pages: Math.ceil(count / lim)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTenantById = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tenant no encontrado' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createTenant = async (req, res) => {
  try {
    const { name, slug, domain, plan = 'basic', settings = {} } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Nombre y slug son requeridos' });
    }

    // Verificar que el slug sea único
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingTenant) {
      return res.status(400).json({ error: 'El slug ya está en uso' });
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .insert({
        name,
        slug,
        domain,
        plan,
        settings,
        status: 'active'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateTenant = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, domain, status, plan, settings } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (slug !== undefined) updateData.slug = slug;
    if (domain !== undefined) updateData.domain = domain;
    if (status !== undefined) updateData.status = status;
    if (plan !== undefined) updateData.plan = plan;
    if (settings !== undefined) updateData.settings = settings;

    // Si se está cambiando el slug, verificar que sea único
    if (slug) {
      const { data: existingTenant } = await supabaseAdmin
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .neq('id', id)
        .single();

      if (existingTenant) {
        return res.status(400).json({ error: 'El slug ya está en uso' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tenant no encontrado' });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteTenant = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el tenant no sea el por defecto
    if (id === 'a1b2c3d4-e5f6-7890-1234-567890abcdef') {
      return res.status(400).json({ error: 'No se puede eliminar el tenant por defecto' });
    }

    const { error } = await supabaseAdmin
      .from('tenants')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTenantUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * lim;

    const { data, error, count } = await supabaseAdmin
      .from('profiles')
      .select('id, first_name, last_name, username, role, created_at', { count: 'exact' })
      .eq('tenant_id', id)
      .order('created_at', { ascending: false })
      .range(offset, offset + lim - 1);

    if (error) throw error;

    res.json({
      items: data,
      pagination: {
        page: pageNum,
        limit: lim,
        total: count,
        pages: Math.ceil(count / lim)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createTenantUser = async (req, res) => {
  try {
    const { id } = req.params; // tenant_id
    const { username, email, firstName, lastName, password, role } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña es requerida y debe tener al menos 6 caracteres' });
    }

    // Manejar role que puede venir como string o como objeto {label, value}
    let roleValue = role;
    if (typeof role === 'object' && role !== null) {
      roleValue = role.value || role.label || '';
    }
    const normalizedRole = (roleValue || '').toString().toLowerCase();
    if (!['administrador', 'vendedor', 'admin', 'seller'].includes(normalizedRole)) {
      return res.status(400).json({ error: 'Rol inválido. Use "administrador" o "vendedor"' });
    }
    const roleToStore = ['administrador', 'admin'].includes(normalizedRole) ? 'admin' : 'seller';

    const trimmedUsername = (username || '').trim();
    const trimmedEmail = (email || '').trim();

    if (!trimmedUsername && !trimmedEmail) {
      return res.status(400).json({ error: 'Debe proporcionar un nombre de usuario o un correo electrónico' });
    }

    const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/;
    let finalEmail = trimmedEmail;
    if (!finalEmail) {
      if (emailRegex.test(trimmedUsername)) {
        finalEmail = trimmedUsername;
      } else {
        finalEmail = `${trimmedUsername}@tenant.local`;
      }
    }

    // Verificar unicidad de username si viene provisto
    if (trimmedUsername) {
      const { data: existingUsername, error: usernameError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', trimmedUsername)
        .maybeSingle();
      if (usernameError && usernameError.code !== 'PGRST116') {
        throw usernameError;
      }
      if (existingUsername) {
        return res.status(409).json({ error: 'El nombre de usuario ya existe' });
      }
    }

    // Crear usuario en Auth
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: finalEmail,
      password,
      email_confirm: true,
      user_metadata: {
        role: roleToStore,
        tenant_id: id
      }
    });
    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    const userId = created.user?.id;
    if (!userId) {
      return res.status(500).json({ error: 'No se pudo obtener el ID del usuario creado' });
    }

    // Insertar o actualizar perfil
    const { data: upsertedProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: userId,
        first_name: firstName || null,
        last_name: lastName || null,
        role: roleToStore,
        username: trimmedUsername || null,
        tenant_id: id
      }, { onConflict: 'id' })
      .select('id, first_name, last_name, username, role')
      .single();
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(400).json({ error: profileError.message });
    }

    return res.status(201).json({
      id: userId,
      firstName: upsertedProfile?.first_name || firstName || '',
      lastName: upsertedProfile?.last_name || lastName || '',
      username: upsertedProfile?.username || trimmedUsername || null,
      role: roleToStore === 'admin' ? 'administrador' : 'vendedor',
      email: finalEmail,
      status: 'Activo'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const getTenantStats = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener estadísticas del tenant
    const [usersCount, productsCount, ordersCount, customersCount] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact' }).eq('tenant_id', id),
      supabaseAdmin.from('products').select('id', { count: 'exact' }).eq('tenant_id', id),
      supabaseAdmin.from('orders').select('id', { count: 'exact' }).eq('tenant_id', id),
      supabaseAdmin.from('customers').select('id', { count: 'exact' }).eq('tenant_id', id)
    ]);

    res.json({
      users: usersCount.count || 0,
      products: productsCount.count || 0,
      orders: ordersCount.count || 0,
      customers: customersCount.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllTenants,
  getTenantById,
  createTenant,
  updateTenant,
  deleteTenant,
  getTenantUsers,
  createTenantUser,
  getTenantStats
};
