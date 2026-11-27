# Arena Atômica — guia de retomada para outra IA

Este documento é contexto de trabalho para retomar o projeto em uma sessão nova. O ponto de referência é a branch `refinamento-arena`, na qual a validação do cadastro foi registrada em `9919d2f`. O código e o Git são as fontes de verdade se esse ponto ficar desatualizado.

## Como começar

1. Leia a solicitação atual e confira `git status --short --branch` e `git log -8 --oneline`. Preserve trabalho local e arquivos do usuário.
2. Leia o [README](../README.md) e os arquivos envolvidos na tarefa. Se o usuário pedir auditoria antes de alterações, entregue o diagnóstico e aguarde autorização.
3. Faça mudanças incrementais mantendo Python, SQLite, JavaScript nativo e Canvas. Preserve a identidade visual azul-marinho, verde-limão e roxo, os personagens voxel e a navegação responsiva.
4. Valide o comportamento pela interface e pela API quando forem afetadas. Informe os testes realmente executados, o que ficou pendente e se as mudanças foram commitadas. Não faça push nem commit sem autorização.
5. Trate `.env`, cookies, credenciais e bancos locais como dados privados. O `.env` existia sem rastreamento no momento deste registro. Não leia, divulgue ou inclua seus valores em commits ou documentação sem necessidade.

## Estado atual e mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server.py` | HTTP e arquivos estáticos permitidos, API, matchmaking, cronômetro, apuração, histórico, perfil e conexão SQLite. |
| `accounts.py` | Cadastro, login, validação de credenciais, sessões e transferência opcional de jogador legado. |
| `index.html`, `style.css`, `game.js` | Autenticação, lobby, arena, resultados, histórico, perfil e navegação. |
| `arena.js` | Renderização voxel, personagens, cenários, combate e finalizações no Canvas. |
| `questions.json` | Banco privado do duelo, derivado de `Simulado_P2_90_questoes.pdf`. Tem 90 questões, trinta por dificuldade, com temas e explicações. |
| `training.js`, `practice.js` | Banco solo independente, com 24 exercícios, filtros por tema e dificuldade, feedback e revisão. Tudo roda no navegador. |
| `study.js` | Laboratório com conceitos e exemplos para os cinco temas do duelo. As recomendações do histórico abrem a aula, que encaminha ao treino apropriado. |
| `tests/test_duel.py`, `tests/test_http.py` | Regras e persistência do duelo, sessões, validação HTTP, isolamento do histórico e compatibilidade de dados. |
| `Dockerfile`, `compose.yaml`, `.dockerignore` | Contêiner sem root, lista de arquivos incluídos, volume do SQLite, porta e origem pública. Ao criar um módulo necessário em runtime, confira também essa lista. |

O perfil apresenta estatísticas reais de duelos concluídos e o último químico escolhido. O histórico lista os dez duelos mais recentes, abre detalhes privados e sugere temas com base nos erros marcados. O laboratório pode ser consultado como visitante. Duelos, treino, perfil e histórico exigem conta.

## Invariantes a preservar

**Identidade e dados.** Sem sessão, `GET /api/state` informa visitante e não cria jogadores. `accounts.id` é permanente e independente da sessão. `accounts.player` aponta para `players.token`, que continua sendo referenciado por `matches.first` e `matches.second`. As rodadas e os resultados ficam no JSON de `matches.data`. Preserve essas referências em migrações e teste também partidas legadas.

**Sessões.** O e-mail é normalizado e único. As senhas usam scrypt com sal. O token de sessão não é o identificador do jogador e só seu hash é persistido. O cookie `reacao_session` usa `HttpOnly`, `SameSite=Lax` e expira em 30 dias, com `Secure` quando a origem pública é HTTPS. Logout revoga a sessão atual. O cadastro pode vincular um jogador legado uma única vez se o usuário optar pela transferência e apresentar o cookie original `reacao`; não associe perfis por coincidência de nome ou e-mail. O cookie legado sozinho não autoriza leitura de histórico. O cadastro retorna `fieldErrors` para mensagens junto aos campos e rejeita dados inválidos também no servidor.

**Duelo.** Pareamento aleatório entre dois jogadores prontos, contagem de três segundos, até dez rodadas. A primeira resposta tem 35 segundos. Após ela, o outro jogador tem 15 segundos. A revelação dura três segundos quando os dois respondem e sete quando há timeout. Cada acerto soma um ponto. Se só um acertar, o outro perde vida. Se ambos acertarem, esquivam e ninguém perde vida. Golpe comum causa 25 PV, especial carregado a cada três acertos causa até 40 PV e golpe letal usa a finalização do químico. Vence quem nocautear ou terminar com mais vida; vida igual dá empate. Desistência não substitui um resultado já decidido. O servidor valida prazos, respostas e pontos.

**Questões e revisão.** O servidor embaralha as alternativas na mesma ordem para os dois jogadores e registra essa ordem para o gabarito. Partidas antigas sem ordem salva usam a ordem original. Não exponha o banco competitivo nem o gabarito antes da revelação. Não confunda pontuação do quiz com PV. Treino e laboratório ainda não registram progresso durável na conta.

## Executar e validar

Na raiz do projeto:

```sh
python3 server.py --port 8000
python3 -B -m unittest discover -s tests -v
node --check game.js
docker compose config --quiet
```

Para testar pelo Docker, use `docker compose up --build -d`. A porta publicada é definida por `REACAO_PORT` e o SQLite fica no volume `reacao-data`. Fora do Docker, o banco padrão é `reacao.sqlite3`; use `--db` com um arquivo temporário em testes. Em publicação por HTTPS, um proxy termina TLS e `REACAO_PUBLIC_ORIGIN` informa a origem do site. Evite testar migrações contra o volume usado pelo jogador e não remova volumes existentes.

Para verificar o multiplayer, use **duas contas em dois perfis de navegador**. Para verificar identidade persistente, entre na mesma conta em outro perfil e compare identificador e histórico. No ponto de referência, 15 testes automatizados passaram. O cadastro havia sido verificado no Chromium a 320 px, incluindo mensagens por campo, foco no primeiro erro e e-mail duplicado. Não trate esses resultados como validação de alterações posteriores.

## Próximos passos conhecidos

- **Recuperação de senha:** falta definir o serviço de entrega de e-mail. Não declare que a recuperação funciona até implementar e verificar o envio e o fluxo de redefinição.
- **Painel, perfil e histórico:** próxima fase do plano. Reaproveite a conta e o histórico de duelos para um painel pós-login, perfil editável e histórico paginado e filtrável, com dados reais.
- **Treino e biblioteca:** persistir atividades por conta e validar pontuação no servidor antes de usá-la para estatísticas. Evoluir treino livre, simulado e revisão de erros; depois ampliar o currículo e registrar progresso de estudo.
- **Ranking, XP, conquistas e desafios:** dependem de regras de negócio. Confirme critérios antes de criar pontuações, recompensas ou competição pública.

Atualize este guia quando mudanças verificadas alterarem o estado, o modelo de dados ou os comandos de retomada.
