# Próxima etapa — executar testes reais e concluir validação pré-publicação

## Estado confirmado
- Migrations iniciais até a etapa de desafios, mais as migrations de idempotência financeira e privilégios mínimos, aplicadas ao Supabase `metas-com-br`.
- Autenticação por e-mail, recuperação de senha, Caixinhas, contribuições manuais, metas compartilhadas e desafios estão implementados no código.
- A chave de idempotência da contribuição permanece estável durante nova tentativa com os mesmos dados.
- RLS habilitado e privilégios diretos mínimos conferidos nas tabelas financeiras e de desafios.
- O frontend não usa `service_role`.

## Verificações já realizadas
- As duas migrations desta etapa aparecem no histórico remoto do Supabase.
- `anon` não pode consultar metas ou contribuições.
- Usuários autenticados não podem alterar ou excluir contribuições diretamente nem alterar totais agregados.
- RPC de contribuição executável por `authenticated`, não por `anon`.
- A reconciliação atual encontrou zero divergências, mas também zero metas e zero contribuições reais no banco.
- Sintaxe/transpilação de `App.tsx` sem diagnóstico sintático.

## Ainda não validado
A instalação de dependências (`npm install`) excedeu o tempo limite. Não declarar `typecheck`, build Vite ou testes em navegador aprovados. Não há ainda teste ponta a ponta com duas contas.

## Próximos testes obrigatórios
1. Em ambiente de desenvolvimento, instalar dependências e executar `npm run typecheck` e `npm run build`.
2. Criar duas contas adultas de teste e confirmar os e-mails.
3. Criar uma meta individual na conta A e tentar consultá-la pela conta B.
4. Registrar contribuição e simular repetição da mesma RPC com a mesma chave e mesmos dados: deve retornar o mesmo ID, sem duplicar o total.
5. Reutilizar a mesma chave com valor ou meta diferentes: deve rejeitar.
6. Conferir `goal_totals.total_cents` contra a soma de `contributions.amount_cents` após cada operação.
7. Criar meta compartilhada A, convidar B, aceitar o convite e testar permissões: B vê total agregado, mas não os detalhes das contribuições de A; B registra somente sua própria contribuição.
8. Confirmar que B não consegue alterar meta, total, membro, convite ou contribuição de A.
9. Testar recuperação e redefinição de senha com o Redirect URL configurado no Supabase Auth.
10. Repetir os testes de desafios e verificar o progresso automático.

## Bloqueios para publicação
Não publicar para o público antes de build, testes de isolamento, teste de fluxo de convites, revisão de privacidade/termos e validação de exclusão/exportação de conta. Não habilitar menores até implementar e validar autorização do responsável.
11. No desafio de dias distintos, confirmar que registros feitos no mesmo dia contam como um único dia, mesmo quando o usuário informa datas históricas diferentes; registros feitos em dias locais diferentes devem contar separadamente.
