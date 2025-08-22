const supabase = require('../config/supabaseClient')

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return res.status(401).json({ error: 'No autorizado' })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return res.status(401).json({ error: 'Token inválido' })

    const userId = data.user.id
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, first_name, last_name, username')
      .eq('id', userId)
      .maybeSingle()

    req.user = {
      id: userId,
      email: data.user.email,
      role: profile?.role || data.user.user_metadata?.role || null,
      profile: profile || null
    }
    next()
  } catch (e) {
    res.status(401).json({ error: 'No autorizado' })
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    const role = req.user?.role
    if (!role) return res.status(403).json({ error: 'Permisos insuficientes' })
    if (!allowed.includes(role)) return res.status(403).json({ error: 'Permisos insuficientes' })
    next()
  }
}

module.exports = { authMiddleware, requireRole }


