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

Abra `http://localhost:8000` em dois perfis de navegador ou em uma janela normal e uma anônima. Cada perfil recebe uma sessão independente. No Docker, o SQLite fica no volume `reacao-data`. Sem Docker, o arquivo padrão é `reacao.sqlite3`. Use `REACAO_PORT` para mudar a porta publicada pelo Compose.

## Como jogar

1. Escolha um nome e um químico, depois clique em **Ficar pronto**. A fila reúne dois jogadores prontos e inicia uma contagem de três segundos.
2. Responda clicando em uma alternativa ou com as teclas **1 a 4**. Há 35 segundos para a primeira resposta. Depois dela, o outro jogador recebe 15 segundos.
3. Cada acerto vale um ponto. Se só um acertar, o outro perde vida. A cada três acertos, o jogador carrega um especial. Os dois acertando, ambos esquivam.
4. Vence quem derrubar o oponente ou terminar a décima rodada com mais vida. Vidas iguais dão empate. A pontuação serve para acompanhar o desempenho no quiz.
5. Consulte as explicações em **O que você aprendeu?**. O histórico permite abrir os detalhes dos seus duelos recentes e sugere os temas com mais erros nas alternativas marcadas. **Jogar novamente** volta à fila geral. Em **Perfil**, consulte o total de duelos, pontos e a precisão nas respostas marcadas.

## Arquitetura e dados

- `index.html`, `style.css` e `game.js` implementam lobby, duelo e revisão. `arena.js` desenha personagens, cenários e efeitos com Canvas 2D.
- `server.py` serve a interface e a API HTTP. O navegador consulta o estado periodicamente. Prazos, respostas, pontuação e resultado são decididos e validados no servidor.
- O SQLite guarda `players` e `matches`. Uma partida referencia dois jogadores e persiste seu estado e as rodadas em JSON. A ordem das alternativas é comum aos dois jogadores da rodada e fica registrada para reabrir o gabarito. Duelos anteriores ao embaralhamento usam a ordem original.
- `questions.json` contém as 90 questões derivadas do `Simulado_P2_90_questoes.pdf`, com dificuldade, tema, alternativa correta e explicação. A fonte informa a origem do banco. A revisão científica independente ainda está pendente.

## Testes

```sh
python3 -B -m unittest discover -s tests -v
node --check game.js
node --check arena.js
docker compose config --quiet
```

A suíte cobre contagem regressiva, cancelamento, respostas simultâneas, duplicidade, timeout, privacidade da resposta antes da revelação, reconexão, revisão de duelos antigos e persistência do resultado. Use duas sessões no navegador para conferir foco, mensagens, efeitos, navegação e responsividade.

## Limitações

A identidade atual é vinculada ao cookie do navegador. Contas recuperáveis, ranking, recompensas e treinamento solo são módulos futuros. Exposição pública exige HTTPS e avaliação de limites de requisição, retenção de dados e capacidade sob carga.
