'use strict';

const $ = id => document.getElementById(id);
const arena = createArena($('arena'));
const difficulties = ['Fácil','Média','Difícil'];
const descriptions={
  curie:'Pioneira da radioatividade.',
  mendeleev:'Organizou a tabela periódica.',
  lavoisier:'Investigou a combustão e o papel do oxigênio.',
  franklin:'Usou difração de raios X para estudar o DNA.',
};
const forfeitLabels = {
  forfeit: 'O duelo terminou por desistência.',
  disconnect: 'O duelo terminou por desconexão.',
};
let state, view='arena', connected=false, pending=false, inFlight=null;
let dismissed, lastBattle='', lastHistory='', sceneKey='', deadline=null;
let lastFighters='', lastRoom='', celebratedMatch='';
let serverClock={at:0,now:0};

try { dismissed=sessionStorage.getItem('reacao-dismissed'); } catch {}

function make(tag,text,className) {
  const element=document.createElement(tag);
  if(text!==undefined) element.textContent=text;
  if(className) element.className=className;
  return element;
}

for(const [id,chemist] of Object.entries(chemists)) {
  const label=make('label');
  const radio=make('input');
  radio.name='chemist';
  radio.type='radio';
  radio.value=id;
  radio.checked=id==='curie';
  const chip=make('span',chemist.symbol,'element');
  chip.style.setProperty('--chip',chemist.color);
  chip.setAttribute('aria-hidden','true');
  const info=make('span',undefined,'roster-info');
  info.append(make('strong',chemist.name),make('small',descriptions[id]));
  label.append(radio,chip,info);
  radio.addEventListener('change',render);
  $('roster').append(label);
}

function selectedChemist() {
  return document.querySelector('[name=chemist]:checked').value;
}

function showScene(theme,players) {
  const key=[theme,...players].join(':');
  if(key===sceneKey) return;
  sceneKey=key;
  arena.show(theme,players);
  $('arena-name').textContent=arenas[theme].name.toLocaleUpperCase('pt-BR');
  $('stage-detail').textContent=arenas[theme].detail;
}

function sayError(message='') {
  $('error').textContent=message;
  $('error').hidden=!message;
}

function setView(next) {
  view=next;
  $('arena-view').hidden=next!=='arena';
  $('history-view').hidden=next!=='history';
  $('menu-tab').setAttribute('aria-pressed',String(next==='arena'));
  $('history-tab').setAttribute('aria-pressed',String(next==='history'));
  render();
}
$('menu-tab').addEventListener('click',()=>setView('arena'));
$('history-tab').addEventListener('click',()=>setView('history'));
$('how').addEventListener('click',()=>$('instructions').showModal());
$('player-name').addEventListener('input',render);

function renderSettings(rules) {
  if(!rules) return;
  $('how').disabled=false;
  const rows=[
    ['Modo','Duelo online · 1 × 1'],['Rodadas','Até '+rules.rounds],
    ['Tempo',rules.roundSeconds+' s para a primeira resposta · '+rules.responseSeconds+' s para a segunda'],
    ['Dificuldade','Fácil → Média → Difícil'],['Conteúdo','Simulado P2 · Química orgânica e biomoléculas'],
  ];
  $('settings-list').replaceChildren(...rows.flatMap(([label,value])=>[make('dt',label),make('dd',value)]));
  $('instructions-list').replaceChildren(...[
    'Escolha um químico e clique em Ficar pronto. A fila reúne dois jogadores prontos.',
    'Toque em uma alternativa ou use as teclas 1 a 4. Cada acerto vale um ponto.',
    'O relógio começa em '+rules.roundSeconds+' s. Após a primeira resposta, o outro jogador tem '+rules.responseSeconds+' s.',
    'Se só um acertar, o oponente perde '+rules.hitDamage+' PV. A cada '+rules.specialThreshold+' acertos, o especial pode tirar '+rules.specialDamage+' PV. Se ambos acertarem, os dois esquivam. Se ninguém acertar, ninguém perde vida.',
    'Vence quem nocautear o oponente ou tiver mais vida após '+rules.rounds+' rodadas. Vidas iguais dão empate.',
  ].map(line=>make('li',line)));
}

function renderRoom(match) {
  const queued=state?.ready;
  const players=match ? match.players : [
    {name:$('player-name').value.trim() || 'Você',chemist:selectedChemist()},
    null,
  ];
  const statuses=match ? match.connections.map((online,index)=>(index===match.side ? connected : online) ? 'Pronto' : 'Reconectando') :
    [!connected ? 'Reconectando' : queued ? 'Pronto' : 'Conectado','Aguardando'];
  const signature=JSON.stringify([players,statuses,match?.side]);
  if(signature===lastRoom) return;
  lastRoom=signature;
  $('room-players').replaceChildren(...players.map((player,index)=>{
    const slot=make('div',undefined,'room-player');
    const heading=make('span','Jogador '+(index+1)+(index===(match?.side ?? 0) ? ' · você' : ''),'slot-label');
    const indicator=make('span',statuses[index],'presence');
    indicator.dataset.status=statuses[index];
    slot.append(heading,indicator,make('strong',player?.name || 'Vaga aberta'),
      make('small',player ? chemists[player.chemist].name : 'Buscando um oponente pronto'));
    return slot;
  }));
}

function renderHistory() {
  const items=state?.history || [];
  const topics=state?.reviewTopics || [];
  const signature=JSON.stringify([connected,items,topics]);
  if(signature===lastHistory) return;
  lastHistory=signature;
  if(!items.length) {
    $('history-list').replaceChildren(make('p',connected ? 'Seus duelos concluídos aparecerão aqui.' : 'O servidor está indisponível.','panel-note'));
    return;
  }
  const list=make('ul');
  for(const item of items) {
    const row=make('li');
    const rounds=item.rounds===1 ? '1 rodada resolvida' : item.rounds+' rodadas resolvidas';
    const details=make('button','Detalhes','link-button');
    details.type='button';
    details.setAttribute('aria-label','Detalhes do duelo contra '+item.opponent);
    details.addEventListener('click',()=>openHistoryResult(item.id));
    const info=make('span','Contra '+item.opponent+' · '+rounds);
    info.append(make('small',item.outcome));
    row.append(info,details);
    list.append(row);
  }
  const content=$('history-list');
  content.replaceChildren(list);
  if(topics.length) {
    const suggested=make('p',topics.map(({topic,misses})=>
      topic+' ('+misses+(misses===1 ? ' erro)' : ' erros)')).join(' · '),'panel-note');
    content.append(make('h3','Sugestões de revisão'),make('p','Temas com mais erros nos seus últimos duelos.'),suggested);
  }
}

function renderFighters(match,animatePoints) {
  const signature=JSON.stringify([match.id,match.hp,match.charge,match.scores,match.phase,match.round,match.connections,connected]);
  if(signature===lastFighters) return;
  lastFighters=signature;
  $('fighters').replaceChildren(...match.players.map((player,index)=>{
    const card=make('div',undefined,'fighter');
    const life=make('progress');
    life.max=100;
    life.value=match.hp[index];
    life.setAttribute('aria-label','Vida de '+player.name);
    const special=make('progress',undefined,'special-meter');
    const firing=match.phase==='reveal' && match.result.specials?.[index];
    special.max=match.specialThreshold;
    special.value=firing ? special.max : match.charge[index];
    special.setAttribute('aria-label','Especial de '+player.name);
    const status=make('small',firing ? 'ESPECIAL LANÇADO' : 'ESPECIAL '+special.value+'/'+special.max,'special-label');
    const header=make('div',undefined,'fighter-heading');
    header.append(make('strong',player.name+(index===match.side ? ' (você)' : '')),
      make('span',match.scores[index]+' pt','fighter-score'));
    if(animatePoints && match.result.correct[index]) header.append(make('span','+1','point-gain'));
    const online=index===match.side ? connected : match.connections?.[index];
    const connection=make('span',online ? 'Conectado' : 'Reconectando','presence');
    connection.dataset.status=connection.textContent;
    connection.hidden=match.phase==='finished';
    card.append(header,make('small',chemists[player.chemist].name+' · '+match.hp[index]+' PV'),life,status,special,connection);
    return card;
  }));
}

function resultMetadata(match) {
  const duration=match.duration===null ? 'Duração indisponível' :
    Math.floor(match.duration/60)+' min '+String(match.duration%60).padStart(2,'0')+' s';
  const winner=match.winner===null ? 'Empate' : 'Vencedor · '+match.players[match.winner].name;
  return winner+' · '+duration;
}

function reviewItem(entry,explain=false) {
  const label=option=>option.letter+') '+option.text;
  const item=make('li');
  const correct=entry.answer?.letter===entry.correct.letter;
  item.append(make('strong',entry.prompt),make('span','Correta · '+label(entry.correct)));
  if(!correct) item.append(make('span',entry.answer ? 'Sua resposta · '+label(entry.answer) : 'Sem resposta'));
  else item.append(make('span','Você acertou','review-correct'));
  if(explain) item.append(make('p',entry.explanation));
  return item;
}

async function openHistoryResult(id) {
  const dialog=$('history-detail');
  const content=$('history-detail-content');
  content.replaceChildren(make('p','Carregando…','panel-note'));
  dialog.showModal();
  const load=new AbortController();
  dialog.addEventListener('close',()=>load.abort(),{once:true});
  try {
    const response=await fetch('/api/history/'+encodeURIComponent(id),{
      signal:AbortSignal.any([load.signal,AbortSignal.timeout(5000)]),
    });
    if(!response.ok) throw new Error('Histórico indisponível');
    const match=await response.json();
    if(load.signal.aborted) return;
    const players=make('ul',undefined,'history-score');
    players.append(...match.players.map((player,index)=>make('li',
      player.name+' · '+chemists[player.chemist].name+' · '+match.scores[index]+' pt')));
    const key=make('details',undefined,'answer-key');
    const list=make('ol');
    list.append(...match.summary.review.map(entry=>reviewItem(entry,true)));
    key.append(make('summary','Ver gabarito'),list);
    content.replaceChildren(make('h3',outcome(match)),make('p',resultMetadata(match),'panel-note'),players);
    if(match.summary.review.length) content.append(key);
  } catch {
    if(!load.signal.aborted) content.replaceChildren(make('p','Não foi possível carregar o duelo.','panel-note'));
  }
}

function renderSummary(match) {
  const deck=$('battle-summary');
  if(deck.dataset.match===match.id) return;
  deck.dataset.match=match.id;
  const {points,review,hits,errors,accuracy,bestStreak,unanswered}=match.summary;
  const total=review.length;
  $('battle-points').textContent=points+(points===1 ? ' ponto' : ' pontos');
  $('battle-total').textContent=total ? 'de '+total+(total===1 ? ' possível' : ' possíveis') : 'Nenhuma rodada concluída';
  $('result-meta').textContent=resultMetadata(match);
  $('result-players').replaceChildren(...match.players.map((player,index)=>{
    const line=make('div',undefined,'result-player');
    const name=make('span',undefined);
    name.append(make('strong',player.name+(index===match.side ? ' (você)' : '')),make('small',chemists[player.chemist].name));
    line.append(name,make('strong',match.scores[index]+' pt','fighter-score'));
    return line;
  }));
  const stats=[['Acertos',hits],['Erros',errors],['Em branco',unanswered],['Precisão',accuracy===null ? '—' : accuracy+'%'],['Melhor sequência',bestStreak]];
  $('result-stats').replaceChildren(...stats.map(([label,value])=>{
    const group=make('div');
    group.append(make('dt',label),make('dd',String(value)));
    if(label==='Precisão') group.title='Calculada sobre as respostas marcadas';
    return group;
  }));

  const topics=[...new Set(review.map(item=>item.topic))];
  const missed=review.filter(entry=>entry.answer?.letter!==entry.correct.letter);
  $('learning').hidden=!total;
  $('topics').textContent=topics.join(' · ')+(missed.length ? '' : ' · Você acertou todas as questões.');
  $('missed-review').hidden=!missed.length;
  $('missed-review').open=false;
  $('missed-list').replaceChildren(...missed.map(entry=>reviewItem(entry,true)));
  $('answer-key').hidden=false;
  $('answer-key').open=false;
  $('review-list').replaceChildren(...(total ? review.map(entry=>reviewItem(entry)) : [make('li','Nenhuma rodada concluída.')]));
}

function playResultEffect(match) {
  if(view!=='arena' || match.id===celebratedMatch || match.winner===null) return;
  celebratedMatch=match.id;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer=$('result-effect');
  const won=match.winner===match.side;
  const elements=['H','He','C','N','O','Ne','Na','Mg','Si','Cl','K','Ca','Fe','Cu','Zn','Ag','Au','Ra'];
  const count=won ? elements.length : 24;
  const pieces=Array.from({length:count},(_,index)=>{
    const piece=make('span',won ? elements[index] : '',won ? 'element-flight' : 'blast-spark');
    if(won) {
      piece.style.setProperty('--left',(5+index*37%90)+'%');
      piece.style.setProperty('--drift',(index%2 ? 1 : -1)*(30+index*13%100)+'px');
      piece.style.setProperty('--tilt',(index%2 ? 1 : -1)*(10+index*7%30)+'deg');
      piece.style.setProperty('--delay',index%6*85+'ms');
      piece.style.setProperty('--particle-color',index%3===0 ? '#d0b3ff' : '#e0ff86');
    } else {
      const angle=index*2.399;
      const distance=95+index*73%280;
      piece.style.setProperty('--dx',Math.cos(angle)*distance+'px');
      piece.style.setProperty('--dy',Math.sin(angle)*distance*.68+'px');
      piece.style.setProperty('--tilt',index*37+'deg');
      piece.style.setProperty('--particle-color',index%3===0 ? '#ffb56e' : '#f87e92');
    }
    return piece;
  });
  if(!won) pieces.unshift(make('span',undefined,'blast-core'),make('span',undefined,'blast-ring'));
  layer.replaceChildren(...pieces);
  setTimeout(()=>pieces.forEach(piece=>piece.remove()),3100);
}

function renderDuel(match) {
  const signature=JSON.stringify([match,connected,pending]);
  deadline=match.deadline;
  const finished=match.phase==='finished';
  const reveal=match.phase==='reveal';
  const responseWindow=match.phase==='question' && match.answered.some(Boolean);
  const resultKey=match.id+':'+match.round+':'+match.phase;
  const phaseChanged=resultKey!==lastBattle;
  if(phaseChanged) {
    lastBattle=resultKey;
    if(reveal) arena.animate(match.result);
    else if(finished && match.result?.finisher) arena.showKnockout(match.result.damaged);
    else arena.clear();
  }
  if($('duel').dataset.state===signature) return;
  $('duel').dataset.state=signature;
  showScene(match.arena,match.players.map(player=>player.chemist));
  renderFighters(match,phaseChanged&&reveal);
  $('round-label').textContent=finished ? 'DUELO ENCERRADO' : 'RODADA '+String(match.round).padStart(2,'0')+' / '+state.rules.rounds;
  $('level').textContent=finished ? 'RESULTADO' : difficulties[match.level-1].toLocaleUpperCase('pt-BR')+' · SIMULADO P2';
  $('duel').classList.toggle('response-window',responseWindow);
  $('clock').setAttribute('aria-label',responseWindow ? 'Tempo para a segunda resposta' : 'Tempo da rodada');
  $('quiz-heading').textContent=finished ? outcome(match) : 'Desafio químico';
  $('clock').hidden=finished;
  $('round-progress').hidden=finished;
  const remaining=state.rules.rounds-match.round;
  const remainingLabel=remaining===0 ? 'Última rodada' : remaining===1 ? '1 rodada após esta' : 'Até '+remaining+' rodadas após esta';
  $('round-remaining').hidden=finished;
  if($('round-remaining').textContent!==remainingLabel) $('round-remaining').textContent=remainingLabel;
  $('round-progress').max=state.rules.rounds;
  $('round-progress').value=match.round;
  const opponentOnline=match.connections?.[1-match.side];
  $('connection-note').hidden=finished || connected&&opponentOnline;
  $('connection-note').textContent=!connected ? 'Conexão interrompida. Tentando reconectar…' : 'Conexão do oponente instável. Aguardando retorno.';
  $('replay').disabled=pending || !connected;
  $('question').hidden=finished;
  $('leave').hidden=finished;
  $('leave').disabled=pending || !connected || match.resultLocked;
  $('result-actions').hidden=!finished;
  $('battle-summary').hidden=!finished;
  $('arena-result').hidden=!reveal&&!finished;
  $('arena-result').classList.remove('special-hit');
  $('arena-result').classList.toggle('danger',reveal&&match.result.damaged===match.side);
  if(finished) {
    delete $('feedback').dataset.verdict;
    renderSummary(match);
    $('answers').replaceChildren();
    $('arena-result').textContent=outcome(match);
    $('feedback').textContent=(match.result?.finisher && match.reason==='score' ? chemists[match.result.finisher].finisher+' encerrou o duelo.' : '') || forfeitLabels[match.reason] ||
      (Math.min(...match.hp)===0 ? 'O duelo terminou por nocaute.' : 'O duelo chegou ao limite de rodadas.');
    return;
  }
  delete $('feedback').dataset.verdict;
  $('question').textContent=match.prompt;
  const buttons=match.options.map((option,index)=>{
    const button=make('button',undefined,'choice');
    button.type='button';
    button.append(make('span','ABCD'[index]),document.createTextNode(option));
    button.disabled=reveal || match.choice!==null || !connected || pending;
    if(match.choice===index) {
      button.classList.add('selected');
      button.setAttribute('aria-pressed','true');
    }
    if(reveal && match.correct===index) button.classList.add('correct');
    if(reveal && match.choice===index && match.correct!==index) button.classList.add('wrong');
    button.addEventListener('click',()=>respond(index));
    return button;
  });
  const focusedIndex=[...$('answers').children].indexOf(document.activeElement);
  $('answers').replaceChildren(...buttons);
  if(focusedIndex>=0 && !buttons[focusedIndex]?.disabled) buttons[focusedIndex].focus({preventScroll:true});
  if(reveal) {
    const result=match.result;
    let message='Nenhum acerto';
    const special=result.specials?.some(Boolean);
    const damage=result.damage ?? 25;
    if(result.finisher) message=chemists[result.finisher].finisher+' · NOCAUTE';
    else if(result.correct.every(Boolean)) message=special ? 'Especial esquivado!' : 'Esquiva dupla!';
    else if(result.damaged!==null) {
      const label=special ? 'Explosão roxa' : result.damaged===match.side ? 'Você sofreu um golpe' : 'Golpe certeiro';
      message=label+' · −'+damage+' PV';
    }
    $('arena-result').classList.toggle('special-hit',Boolean(special || result.finisher));
    $('arena-result').textContent=message;
    const verdict=result.correct[match.side] ? 'Correta · +1 ponto' : match.choice===null ? 'Sem resposta · 0 pontos' : 'Incorreta · 0 pontos';
    $('feedback').textContent=verdict+' · Gabarito '+ 'ABCD'[match.correct]+'.';
    $('feedback').dataset.verdict=result.correct[match.side] ? 'correct' : 'incorrect';
  } else if(match.choice!==null) {
    $('feedback').textContent='Resposta registrada. O oponente tem 15 segundos para responder.';
  } else {
    $('feedback').textContent=match.answered[1-match.side] ? 'O oponente respondeu. Você tem 15 segundos para responder.' : 'As respostas aparecem ao fim da rodada.';
  }
}

function outcome(match) {
  return match.winner===null ? 'Empate' : match.winner===match.side ? 'Vitória!' : 'Derrota';
}

function render() {
  const count=state?.online;
  $('online').textContent=connected ? count+' online' : 'Sem conexão';
  $('online').classList.toggle('connected',connected);
  if(view==='history') renderHistory();
  const match=state?.match?.id!==dismissed ? state?.match : null;
  const preparing=match?.phase==='countdown';
  const playing=Boolean(match && !preparing);
  const finished=match?.phase==='finished';
  const screen=finished ? 'result' : playing ? 'battle' : 'lobby';
  document.body.dataset.screen=view==='history' ? 'history' : screen;
  $('menu-tab').textContent=finished ? 'Resultado' : playing ? 'Arena' : 'Lobby';
  $('eyebrow').textContent=view==='history' ? 'HISTÓRICO' : finished ? 'DUELO ENCERRADO' : 'DUELO ONLINE / 1 × 1';
  $('subtitle').textContent=view==='history' ? 'Acompanhe seus duelos encerrados.' : finished ?
    'Confira seu desempenho e revise as questões.' : playing ?
      'Cada acerto vale um ponto. A vida decide o duelo.' : 'Escolha seu químico, fique pronto e desafie outro jogador.';
  $('lobby').hidden=playing;
  $('duel').hidden=!playing;
  $('room').hidden=playing;
  $('fighters').hidden=!playing;
  $('countdown').hidden=!preparing;
  $('preview-caption').hidden=Boolean(match);
  if(playing) {
    if(finished) playResultEffect(match);
    renderDuel(match);
    return;
  }
  $('duel').dataset.state='';
  lastBattle='';
  lastFighters='';
  deadline=preparing ? match.deadline : null;
  arena.clear();
  $('arena-result').hidden=true;
  const chosen=selectedChemist();
  if(preparing) showScene(match.arena,match.players.map(player=>player.chemist));
  else showScene('cristais',[chosen]);
  $('preview-caption').textContent=chemists[chosen].name;
  $('round-label').textContent=preparing ? 'PAREAMENTO CONFIRMADO' : 'PRÉVIA DO QUÍMICO';
  const queued=Boolean(state?.ready || preparing);
  $('player-name').disabled=queued || pending;
  $('lobby').querySelector('fieldset').disabled=queued || pending;
  $('ready').hidden=queued;
  $('ready').disabled=!connected || pending;
  $('cancel').hidden=!queued;
  $('cancel').disabled=pending || !connected;
  $('queue-note').textContent=preparing ? 'Os dois jogadores estão prontos.' : queued ?
    'Buscando outro jogador pronto…' : 'A partida começa quando dois jogadores estão prontos.';
  renderRoom(preparing ? match : null);
}

function updateClock() {
  if(!deadline) return;
  const estimatedNow=serverClock.now+(performance.now()-serverClock.at)/1000;
  const seconds=Math.max(0,Math.ceil(deadline-estimatedNow));
  if(!$('countdown').hidden) {
    const number=$('countdown-number');
    const label=seconds===0 ? 'Já!' : String(seconds);
    if(number.textContent!==label) {
      number.textContent=label;
      number.getAnimations().forEach(animation=>animation.cancel());
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        number.animate([{opacity:.4,transform:'scale(.95)'},{opacity:1,transform:'scale(1)'}],{duration:210});
      }
    }
    return;
  }
  $('clock').classList.toggle('urgent', seconds<=5 && state?.match?.phase==='question');
  const label='0:'+String(seconds).padStart(2,'0');
  if($('clock').textContent!==label) $('clock').textContent=label;
}

async function request(action,payload) {
  try {
    const options=payload ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)} : {};
    const response=await fetch('/api/'+action,{...options,signal:AbortSignal.timeout(5000)});
    if(!response.ok && response.status!==409) throw new Error('Falha HTTP '+response.status);
    const next=await response.json();
    if(!state) {
      renderSettings(next.rules);
      if(!$('player-name').value) $('player-name').value=next.profile.name;
      document.querySelector('[name=chemist][value="'+next.profile.chemist+'"]').checked=true;
    }
    const oldMatch=state?.match?.id;
    state=next;
    serverClock={now:state.now,at:performance.now()};
    connected=true;
    if(action!=='state' || $('error').dataset.connection==='true') {
      sayError(state.error);
      $('error').dataset.connection='false';
    }
    if(state.match?.id && state.match.id!==oldMatch && state.match.phase!=='finished' && view!=='arena') setView('arena');
  } catch {
    connected=false;
    $('error').dataset.connection='true';
    sayError('Conexão interrompida. Tentando reconectar…');
  }
  render();
  updateClock();
}

async function poll() {
  if(inFlight || pending) return;
  inFlight=request('state');
  try { await inFlight; } finally { inFlight=null; }
}

async function action(name,payload) {
  if(pending || !connected) return;
  pending=true;
  render();
  try {
    if(inFlight) await inFlight;
    await request(name,payload);
  } finally {
    pending=false;
    render();
  }
}

$('lobby').addEventListener('submit',event=>{
  event.preventDefault();
  action('ready',{name:$('player-name').value,chemist:selectedChemist()});
});
$('cancel').addEventListener('click',()=>action('cancel',{}));
$('leave').addEventListener('click',()=>{
  if(state?.match && confirm('Desistir do duelo conta como derrota. Deseja sair?')) action('leave',{id:state.match.id});
});
function dismissResult() {
  dismissed=state?.match?.id;
  try { sessionStorage.setItem('reacao-dismissed',dismissed); } catch {}
  setView('arena');
}

$('back').addEventListener('click',()=>{
  dismissResult();
  $('ready').focus();
});
$('replay').addEventListener('click',async ()=>{
  if(state?.match?.phase!=='finished') return;
  const previous=state.match;
  const {name,chemist}=previous.players[previous.side];
  await action('ready',{name,chemist});
  if(state?.ready || (state?.match?.id && state.match.id!==previous.id)) {
    dismissed=previous.id;
    try { sessionStorage.setItem('reacao-dismissed',dismissed); } catch {}
  }
});

function respond(choice) {
  const match=state?.match;
  if(match?.phase==='question' && match.choice===null) action('answer',{id:match.id,round:match.round,choice});
}

addEventListener('keydown',event=>{
  const choice='1234'.indexOf(event.key);
  if(event.key.length===1 && choice!==-1 && view==='arena' && !$('duel').hidden &&
    !$('instructions').open && !['INPUT','TEXTAREA'].includes(event.target.tagName) && !event.repeat) respond(choice);
});

setInterval(poll,850);
setInterval(updateClock,200);
poll();
