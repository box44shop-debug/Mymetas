# Implantação do Metas na Vercel

## Configuração do projeto
- Framework: Vite
- Node.js: 22.x
- Comando de instalação: `npm install`
- Comando de build: `npm run build`
- Diretório de saída: `dist`

## Variáveis de ambiente
Configure nos ambientes Production, Preview e Development:

- `VITE_SUPABASE_URL`: URL do projeto Supabase `mymetas`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publishable do projeto Supabase `mymetas`.

A aplicação também aceita `VITE_SUPABASE_ANON_KEY` como alternativa de compatibilidade, mas prefira a chave publishable. Nunca configure `service_role` ou qualquer segredo privado em variável `VITE_`.

## Rotas
O arquivo `vercel.json` encaminha as rotas da aplicação para `index.html`, permitindo o funcionamento do React Router em URLs diretas.

## Antes de publicar
1. Execute `npm install`.
2. Execute `npm run typecheck`.
3. Execute `npm run build`.
4. Faça um cadastro de teste e valide login, criação de meta, contribuição, compartilhamento e recuperação de senha no projeto Supabase `mymetas`.

Não publique como produção antes da validação funcional e da revisão das configurações de autenticação e URLs de redirecionamento no Supabase.
