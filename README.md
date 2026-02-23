# App Electron + Vue

App desktop financeiro local (offline)

## Requisitos
- Node.js 20+
- npm

## Comandos
- `npm install`: instala dependencias
- `npm run dev`: sobe o app em modo desenvolvimento
- `npm run build`: compila renderer + main/preload
- `npm run start`: compila e abre o app pronto para uso local
- `npm run dist`: gera instalador Windows (NSIS)

###### Banco de dados
- SQLite local com arquivo em `%APPDATA%\\app\\app.db`
- Tabela inicial: `items (id, name)`


######## - feito até o momento - ########

  - Login e cadastro local
  - Hash de senha com scrypt + salt
  - Gestão de contas
  - Metas mensais por categoria
  - Alertas de orçamento (>= 80% e >= 100%)
  - Tema claro/escuro com persistência local
  - Gráfico de tendência mensal (últimos 6 meses)
