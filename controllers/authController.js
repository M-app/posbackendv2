const supabase = require('../config/supabaseClient');
const VIRTUAL_EMAIL_DOMAIN = process.env.VIRTUAL_EMAIL_DOMAIN || 'user.local';

const signUp = async (req, res) => {
  const { email, password } = req.body;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json({ user: data.user });
};

const signIn = async (req, res) => {
  try {
    const { identifier, email, password } = req.body;
    const provided = (email || identifier || '').trim();
    if (!provided || !password) {
      return res.status(400).json({ error: 'Credenciales inválidas' });
    }

    const loginEmail = provided.includes('@')
      ? provided
      : `${provided}@${VIRTUAL_EMAIL_DOMAIN}`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const userId = data.user?.id;
    let profile = null;
    if (userId) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, username')
        .eq('id', userId)
        .maybeSingle();
      profile = profileData || null;
    }

    return res.status(200).json({
      session: data.session,
      user: { ...data.user, profile }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

module.exports = {
  signUp,
  signIn,
  // Refrescar sesión con refresh_token
  async refreshSession(req, res) {
    try {
      const { refreshToken } = req.body || {};
      if (!refreshToken) {
        return res.status(400).json({ error: 'Falta refreshToken' });
      }

      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (error) return res.status(400).json({ error: error.message });

      const userId = data.session?.user?.id || data.user?.id;
      let profile = null;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, role, username')
          .eq('id', userId)
          .maybeSingle();
        profile = profileData || null;
      }

      return res.status(200).json({
        session: data.session,
        user: { ...(data.session?.user || data.user), profile }
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  },
  async signOut(req, res) {
    try {
      // Opcional: invalida tokens del lado de Supabase si se requiere
      await supabase.auth.signOut();
      return res.status(204).send();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
};
