# Arena Atômica

Jogo educativo de Química para dois jogadores. As rodadas combinam perguntas de múltipla escolha com combates em uma arena voxel. O objetivo é incentivar a prática de recuperação de conteúdo e oferecer uma revisão explicada após o duelo. O banco atual é voltado a estudantes que estão revisando química orgânica e biomoléculas no nível do Simulado P2.

## Rodando o jogo

Com Docker:

```sh
docker compose up --build -d
```

Sem Docker, com Python 3.14:

```sh
python3 server.py --port 8000
```

Abra `http://localhost:8000`. Para testar um duelo local, use duas contas em perfis separados do navegador ou em uma janela normal e uma anônima. No Docker, o SQLite fica no volume `reacao-data`. Sem Docker, o arquivo padrão é `reacao.sqlite3`. Use `REACAO_PORT` para mudar a porta publicada pelo Compose.

## Como jogar

1. Entre na sua conta, escolha um químico e clique em **Ficar pronto**. A fila reúne dois jogadores prontos e inicia uma contagem de três segundos.
2. Responda clicando em uma alternativa ou com as teclas **1 a 4**. Há 35 segundos para a primeira resposta. Depois dela, o outro jogador recebe 15 segundos.
3. Cada acerto vale um ponto. Se só um acertar, o outro perde vida. A cada três acertos, o jogador carrega um especial. Os dois acertando, ambos esquivam.
4. Vence quem derrubar o oponente ou terminar a décima rodada com mais vida. Vidas iguais dão empate. A pontuação serve para acompanhar o desempenho no quiz.
5. Consulte as explicações em **O que você aprendeu?**. O histórico permite abrir os detalhes dos seus duelos recentes e sugere os temas com mais erros nas alternativas marcadas. **Jogar novamente** volta à fila geral. Em **Perfil**, consulte o total de duelos, pontos e a precisão nas respostas marcadas.

## Contas e dados antigos

Cadastre um nome de exibição, e-mail e senha com pelo menos 12 caracteres. Use o mesmo e-mail e senha em outro navegador para abrir o mesmo perfil. Cada sessão dura até 30 dias e pode ser encerrada pelo perfil. A senha é derivada com scrypt e sal aleatório. A consulta pública de estado não cria jogadores.

No cadastro, **Transferir os duelos do perfil antigo deste navegador** aparece se houver um cookie antigo válido. Marque para vincular esse perfil à nova conta. O vínculo é único e mantém as referências das partidas. Registros antigos sem prova de titularidade ficam preservados no banco.

## Laboratório e treino solo

Abra **Laboratório de estudos** no lobby ou clique em um tema recomendado no histórico. O laboratório cobre os cinco temas do Simulado P2 com conceitos e exemplos. **Praticar este assunto** abre o treino com o tema já selecionado. Também é possível entrar pelo botão **Treinar sozinho**.

O banco solo tem 24 questões autorais, organizadas por assunto e dificuldade. Cada resposta traz uma explicação, e os erros podem ser revistos ao final. O treino roda no navegador e sua pontuação fica na sessão de treino.

## Arquitetura e dados

- `index.html`, `style.css` e `game.js` implementam lobby, duelo e revisão. `arena.js` desenha personagens, cenários e efeitos com Canvas 2D.
- `server.py` serve a interface e a API HTTP. O navegador consulta o estado periodicamente. Prazos, respostas, pontuação e resultado são decididos e validados no servidor.
- O SQLite guarda `accounts`, `sessions`, `players` e `matches`. Cada conta tem um identificador permanente e vincula um jogador às suas atividades. O banco armazena somente o hash dos tokens de sessão. Uma partida referencia dois jogadores e persiste seu estado e as rodadas em JSON. A ordem das alternativas é comum aos dois jogadores da rodada e fica registrada para reabrir o gabarito. Duelos anteriores ao embaralhamento usam a ordem original.
- `questions.json` contém as 90 questões derivadas do `Simulado_P2_90_questoes.pdf`, com dificuldade, tema, alternativa correta e explicação. A fonte informa a origem do banco. A revisão científica independente ainda está pendente.

## Publicação com HTTPS

O servidor Python fala HTTP. Para disponibilizá-lo em HTTPS, use um proxy reverso que termine TLS e configure a origem pública exata, incluindo a porta se ela não for padrão.

```sh
REACAO_PUBLIC_ORIGIN=https://arena.exemplo.com docker compose up --build -d
```

Sem Docker, use a mesma variável ou `--public-origin https://arena.exemplo.com`. Com origem HTTPS configurada, o servidor emite cookies `Secure` e rejeita requisições de escrita de outra origem quando o navegador informa a origem. Restrinja o acesso direto à porta do aplicativo no ambiente de publicação. O acesso local por HTTP continua disponível sem essa configuração.

## Testes

```sh
python3 -B -m unittest discover -s tests -v
node --check game.js
node --check arena.js
docker compose config --quiet
```

A suíte cobre contagem regressiva, cancelamento, respostas simultâneas, duplicidade, timeout, privacidade da resposta antes da revelação, reconexão, revisão de duelos antigos e persistência do resultado. Os testes por HTTP também verificam os cookies, a validação do corpo das requisições e o acesso ao histórico. Use duas sessões no navegador para conferir foco, mensagens, efeitos, navegação e responsividade.

## Limitações

Recuperação de senha por e-mail depende de um serviço de entrega ainda não definido. Ranking e recompensas são módulos futuros. Exposição pública ainda exige um proxy HTTPS e avaliação de limites de requisição, retenção de dados e capacidade sob carga.
