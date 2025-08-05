# Backend de ControlPOS

Este es el backend para la aplicación ControlPOS, construido con Node.js, Express y Supabase.

## Configuración

1.  **Instalar dependencias:**
    ```bash
    npm install
    ```

2.  **Crear archivo de entorno:**
    Crea un archivo `.env` en la raíz del proyecto y añade las siguientes variables:
    ```
    SUPABASE_URL=TU_SUPABASE_URL
    SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
    PORT=3001
    ```
    Reemplaza `TU_SUPABASE_URL` y `TU_SUPABASE_ANON_KEY` con las credenciales de tu proyecto de Supabase.

## Ejecutar la aplicación

Para iniciar el servidor en modo de desarrollo, ejecuta:
```bash
npm start
```

El servidor se iniciará en `http://localhost:3001`.
