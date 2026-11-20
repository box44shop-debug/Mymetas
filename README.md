# Metas.com.br — base de implementação 0.1

**Slogan:** Seu sonho merece um plano.

Este repositório contém a base do projeto: PWA com React + TypeScript, interface inicial, autenticação Supabase, criação de Caixinhas e registro manual de contribuições.

## Requisitos
- Node.js 20 ou superior
- npm
- Projeto Supabase

## Instalação
```bash
npm install
cp .env.example .env
```

Preencha `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca coloque a chave `service_role` no frontend.

## Banco Supabase
O diretório `supabase/migrations` contém as migrações SQL. Em um novo ambiente, aplique-as em ordem numérica pelo SQL Editor do Supabase.

## Executar e validar
```bash
npm run dev
npm run typecheck
npm run build
```

## Funcionalidades contempladas
- Landing page responsiva.
- Cadastro e login via Supabase Auth.
- Painel inicial e criação de Caixinhas.
- Categorias iniciais e valores-alvo em centavos.
- Registro manual de contribuições por RPC.
- Metas compartilhadas, convites e desafios/conquistas conforme as migrações desta etapa.
- PWA com cache limitado ao shell estático.

## Limitações e segurança
A plataforma registra declarações manuais: não guarda, movimenta ou verifica dinheiro. Antes de produção, valide configuração Supabase, RLS, isolamento entre usuários, autorização de menores, recuperação de conta, LGPD, termos, privacidade e testes de segurança. O fluxo de autorização do responsável para menores precisa ser construído e validado antes de aceitar menores em produção.

## Deploy Vercel
O arquivo `vercel.json` configura build Vite, saída `dist` e rewrite para SPA. Configure as variáveis públicas do Supabase no projeto Vercel.
