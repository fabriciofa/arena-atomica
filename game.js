'use strict';

const $ = id => document.getElementById(id);
const arena = createArena($('arena'));
const difficulties = ['Fácil','Média','Difícil'];
const forfeitLabels = {
  forfeit: 'O duelo terminou por desistência.',
  disconnect: 'O duelo terminou por desconexão.',
};
let state, view='arena', connected=false, pending=false, inFlight=null;
let dismissed, lastBattle='', lastHistory='', sceneKey='', deadline=null;
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
  label.append(radio,chip,make('span',chemist.short));
  radio.setAttribute('aria-label',chemist.name);
  radio.addEventListener('change',()=>showScene('cristais',[id,'mendeleev']));
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
  $('rules').hidden=next!=='arena';
  $('menu-tab').setAttribute('aria-pressed',String(next==='arena'));
  $('history-tab').setAttribute('aria-pressed',String(next==='history'));
  render();
}
$('menu-tab').addEventListener('click',()=>setView('arena'));
$('history-tab').addEventListener('click',()=>setView('history'));

function renderHistory() {
  const items=state?.history || [];
  const signature=JSON.stringify([connected,items]);
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
    row.append(make('span','Contra '+item.opponent+' · '+rounds),make('strong',item.outcome));
    list.append(row);
  }
  $('history-list').replaceChildren(list);
}

function renderFighters(match) {
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
    card.append(make('strong',player.name+(index===match.side ? ' (você)' : '')),
      make('small',chemists[player.chemist].name+' · '+match.hp[index]+' PV'),life,status,special);
    return card;
  }));
}

function renderSummary(match) {
  const deck=$('battle-summary');
  if(deck.dataset.match===match.id) return;
  deck.dataset.match=match.id;
  const {points,review}=match.summary;
  $('battle-points').textContent=points+(points===1 ? ' ponto' : ' pontos');
  const total=review.length;
  $('battle-total').textContent=total ? 'de '+total+(total===1 ? ' possível' : ' possíveis') : 'Nenhuma rodada concluída';
  const key=$('answer-key');
  key.hidden=review.length===0;
  key.open=false;
  const label=option=>option.letter+') '+option.text;
  $('review-list').replaceChildren(...review.map(entry=>{
    const item=make('li');
    const correct=entry.answer?.letter===entry.correct.letter;
    item.append(make('strong',entry.prompt),make('span','Correta · '+label(entry.correct)));
    if(!correct) item.append(make('span',entry.answer ? 'Sua resposta · '+label(entry.answer) : 'Sem resposta'));
    else item.append(make('span','Você acertou','review-correct'));
    return item;
  }));
}

function renderDuel(match) {
  const signature=JSON.stringify([match,connected,pending]);
  deadline=match.deadline;
  const finished=match.phase==='finished';
  const reveal=match.phase==='reveal';
  const responseWindow=match.phase==='question' && match.answered.some(Boolean);
  const resultKey=match.id+':'+match.round+':'+match.phase;
  if(resultKey!==lastBattle) {
    lastBattle=resultKey;
    if(reveal) arena.animate(match.result);
    else if(finished && match.result?.finisher) arena.showKnockout(match.result.damaged);
    else arena.clear();
  }
  if($('duel').dataset.state===signature) return;
  $('duel').dataset.state=signature;
  showScene(match.arena,match.players.map(player=>player.chemist));
  renderFighters(match);
  $('round-label').textContent=finished ? 'DUELO ENCERRADO' : 'RODADA '+String(match.round).padStart(2,'0')+' / 10';
  $('level').textContent=finished ? 'RESULTADO' : difficulties[match.level-1].toLocaleUpperCase('pt-BR')+' · SIMULADO P2';
  $('duel').classList.toggle('response-window',responseWindow);
  $('clock').setAttribute('aria-label',responseWindow ? 'Tempo para a segunda resposta' : 'Tempo da rodada');
  $('quiz-heading').textContent=finished ? outcome(match) : 'Desafio químico';
  $('clock').hidden=finished;
  $('question').hidden=finished;
  $('leave').hidden=finished;
  $('leave').disabled=pending || !connected || Boolean(match.result?.finisher);
  $('back').hidden=!finished;
  $('battle-summary').hidden=!finished;
  $('arena-result').hidden=!reveal&&!finished;
  $('arena-result').classList.remove('special-hit');
  $('arena-result').classList.toggle('danger',reveal&&match.result.damaged===match.side);
  if(finished) {
    renderSummary(match);
    $('answers').replaceChildren();
    $('arena-result').textContent=outcome(match);
    $('feedback').textContent=(match.result?.finisher && match.reason==='score' ? chemists[match.result.finisher].finisher+' encerrou o duelo.' : '') || forfeitLabels[match.reason] ||
      (Math.min(...match.hp)===0 ? 'O duelo terminou por nocaute.' : 'O duelo chegou ao limite de rodadas.');
    return;
  }
  $('question').textContent=match.prompt;
  const buttons=match.options.map((option,index)=>{
    const button=make('button',undefined,'choice');
    button.type='button';
    button.append(make('span','ABCD'[index]),document.createTextNode(option));
    button.disabled=reveal || match.choice!==null || !connected || pending;
    if(match.choice===index) button.classList.add('selected');
    if(reveal && match.correct===index) button.classList.add('correct');
    if(reveal && match.choice===index && match.correct!==index) button.classList.add('wrong');
    button.addEventListener('click',()=>respond(index));
    return button;
  });
  $('answers').replaceChildren(...buttons);
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
    $('feedback').textContent=message+' · Alternativa correta: '+'ABCD'[match.correct]+'.';
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
  $('lobby').hidden=Boolean(match);
  $('duel').hidden=!match;
  $('fighters').hidden=!match;
  if(match) {
    renderDuel(match);
    return;
  }
  $('duel').dataset.state='';
  lastBattle='';
  deadline=null;
  arena.clear();
  $('arena-result').hidden=true;
  showScene('cristais',[selectedChemist(),'mendeleev']);
  $('round-label').textContent='PRÉVIA DA ARENA';
  const queued=Boolean(state?.ready);
  $('player-name').disabled=queued;
  $('lobby').querySelector('fieldset').disabled=queued;
  $('ready').hidden=queued;
  $('ready').disabled=!connected || pending;
  $('cancel').hidden=!queued;
  $('cancel').disabled=pending || !connected;
  $('queue-note').textContent=queued ? 'PRONTO · Buscando outro jogador…' :
    'A partida começa quando dois jogadores estão prontos.';
}

function updateClock() {
  if(!deadline) return;
  const estimatedNow=serverClock.now+(performance.now()-serverClock.at)/1000;
  const seconds=Math.max(0,Math.ceil(deadline-estimatedNow));
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
$('back').addEventListener('click',()=>{
  dismissed=state?.match?.id;
  try { sessionStorage.setItem('reacao-dismissed',dismissed); } catch {}
  render();
  $('ready').focus();
});

function respond(choice) {
  const match=state?.match;
  if(match?.phase==='question' && match.choice===null) action('answer',{id:match.id,round:match.round,choice});
}

addEventListener('keydown',event=>{
  const choice='1234'.indexOf(event.key);
  if(event.key.length===1 && choice!==-1 && view==='arena' && !$('duel').hidden &&
    !['INPUT','TEXTAREA','BUTTON'].includes(event.target.tagName) && !event.repeat) respond(choice);
});

setInterval(poll,850);
setInterval(updateClock,200);
poll();
