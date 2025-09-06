const supabaseAdmin = require('../config/supabaseAdmin');

async function adminAuthMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'No autorizado' })

    // Usar el cliente admin para verificar el token
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: 'Token inválido' })

    const userId = data.user.id
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, first_name, last_name, username, tenant_id')
      .eq('id', userId)
      .maybeSingle()

    if (!profile?.tenant_id) {
      return res.status(403).json({ error: 'Usuario sin tenant asignado' })
    }

    // Verificar que sea super admin
    if (profile.role !== 'super_admin') {
      return res.status(403).json({ error: 'Se requieren permisos de super administrador' })
    }

    req.user = {
      id: userId,
      email: data.user.email,
      role: profile?.role || data.user.user_metadata?.role || null,
      tenant_id: profile.tenant_id,
      profile: profile || null
    }
    next()
  } catch (e) {
    res.status(401).json({ error: 'No autorizado' })
  }
}

module.exports = { adminAuthMiddleware }
