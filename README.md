# HIS-Bodega

Sistema compuesto por un frontend en React/Vite y un backend en FastAPI para gestionar inventario, entradas/salidas, alertas y reportes BI.

## Estructura de carpetas

`
.
├── database.sql              # Script MySQL con esquema y catálogo de especialidades
├── requirements.txt          # Dependencias de frontend (npm)
├── his-bodega-backend/
│   ├── requirements.txt      # Dependencias de backend (pip)
│   ├── main.py               # Aplicación FastAPI
│   ├── models.py             # Modelos SQLAlchemy
│   ├── crud.py               # Operaciones de base de datos
│   ├── auth.py               # Autenticación y JWT
│   ├── database.py           # Conexión a MySQL
│   └── ...
├── src/                      # Frontend React
└── ...
`

## Requisitos previos

- Node.js 18 o superior.
- Python 3.10 o superior.
- MySQL (o servidor MariaDB compatible).
- Git.

## Configuración de la base de datos

1. Crea un archivo .env dentro de his-bodega-backend/ con tus credenciales:

   `env
   MYSQL_HOST=localhost
   MYSQL_PORT=3306
   MYSQL_USER=tu_usuario
   MYSQL_PASSWORD=tu_password
   MYSQL_DB=his_bodega
   SECRET_KEY=una_clave_segura
   `

2. Importa el esquema utilizando database.sql:

   `ash
   mysql -u TU_USUARIO -p < database.sql
   `

3. (Opcional) Inserta un usuario admin de prueba. Genera el hash con passlib:

   `python
   from passlib.context import CryptContext
   pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
   print(pwd.hash("tu_password"))
   `

   Luego ejecuta en MySQL:

   `sql
   INSERT INTO usuarios (nombre, email, password_hash, rol)
   VALUES ('Administrador', 'admin@demo.com', 'HASH_GENERADO', 'admin');
   `

## Backend (FastAPI)

1. Instala dependencias:

   `ash
   cd his-bodega-backend
   pip install -r requirements.txt
   `

2. Levanta el servidor:

   `ash
   uvicorn main:app --reload
   `

   El backend quedará disponible en http://localhost:8000.

### Endpoints principales

- POST /auth/token: Autenticación (grant_type=password).
- GET /usuarios/me: Perfil del usuario autenticado.
- CRUD de insumos, entradas, salidas, lertas y reportes (/reportes/consumo-por-especialidad).

La documentación interactiva está en http://localhost:8000/docs.

## Frontend (React/Vite)

1. Instala dependencias (desde la raíz del proyecto):

   `ash
   npm install
   `

2. Ejecuta en modo desarrollo:

   `ash
   npm run dev
   `

   - Abre http://localhost:5173 en el navegador.
   - El frontend se comunica con el backend ubicado en http://localhost:8000 (ver src/services/api.js). Cambia aseURL si necesitas otro host/puerto.

3. Compila para producción:

   `ash
   npm run build
   `

## Variables y configuraciones destacadas

- Backend: database.py y uth.py obtienen valores sensibles de .env. Nunca subas el .env al repositorio.
- Frontend: el listado de especialidades se trae de /especialidades/ y tiene fallback con las nueve especialidades por defecto.
- Login: para ingresar necesitas un usuario existente en la tabla usuarios con ol adecuado.

## Flujo de trabajo recomendado

1. Clonar repositorio y crear ramas feature en GitHub:

   `ash
   git clone https://github.com/tuusuario/his-bodega-frontendas.git
   cd his-bodega-frontendas
   `

2. Crear .env, importar database.sql, levantar backend y frontend como se explicó.
3. Después de cambios, git add, git commit, git push y abrir pull request.

## Scripts útiles

`ash
# backend
uvicorn main:app --reload

# frontend
default npm run dev
npm run build
`

## Notas finales

- El backend usa SQLAlchemy y FastAPI; cualquier migración o ajuste de modelo se refleja en models.py.
- El frontend usa React 18, vite y librerías como xios, echarts, lucide-react. Las dependencias están en equirements.txt y package.json.
- Revisa README cada vez que actualices el flujo de instalación o dependencias para evitar divergencias.
