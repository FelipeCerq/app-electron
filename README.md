# App Electron + Vue

## Requisitos
- Node.js 20+
- npm

## Comandos
- `npm install`: instala dependencias
- `npm run dev`: sobe o app em modo desenvolvimento
- `npm run build`: compila renderer + main/preload
- `npm run start`: compila e abre o app pronto para uso local
- `npm run dist`: gera instalador Windows (NSIS)

## Banco de dados
- SQLite local com arquivo em `%APPDATA%\\app\\app.db`
- Tabela inicial: `items (id, name)`
