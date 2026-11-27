'use strict';

(() => {
  let questions = [];
  let missed = [];
  let round = 0;
  let answered = false;

  function shuffle(items) {
    const result=[...items];
    for(let i=result.length-1;i>0;i--) {
      const j=Math.floor(Math.random()*(i+1));
      [result[i],result[j]]=[result[j],result[i]];
    }
    return result;
  }

  $('training-topic').append(...Object.keys(trainingBank).map(topic=>new Option(topic,topic)));
  $('training-difficulty').append(...difficulties.map((level,index)=>new Option(level,String(index))));

  function setup() {
    $('training-form').hidden=false;
    $('training-round').hidden=true;
    $('training-result').hidden=true;
    $('training-reset').hidden=true;
  }

  function showQuestion() {
    const [prompt,correct,distractors,explanation]=questions[round];
    answered=false;
    $('training-progress').textContent='Questão '+(round+1)+' de '+questions.length;
    $('training-question').textContent=prompt;
    $('training-feedback').textContent='';
    delete $('training-feedback').dataset.verdict;
    $('training-next').hidden=true;
    const buttons=shuffle([correct,...distractors]).map((option,index)=>{
      const button=make('button',undefined,'choice');
      button.type='button';
      button.append(make('span','ABCD'[index]),document.createTextNode(option));
      button.addEventListener('click',()=>{
        if(answered) return;
        answered=true;
        const hit=option===correct;
        if(!hit) missed.push({prompt,correct,answer:option,explanation});
        buttons.forEach(choice=>choice.disabled=true);
        button.classList.add('selected');
        if(!hit) button.classList.add('wrong');
        buttons.find(choice=>choice.lastChild.textContent===correct).classList.add('correct');
        $('training-feedback').textContent=(hit ? 'Correta. ' : 'Incorreta. Resposta correta: '+correct+'. ')+explanation;
        $('training-feedback').dataset.verdict=hit ? 'correct' : 'incorrect';
        $('training-next').textContent=round+1===questions.length ? 'Ver resultado' : 'Próxima questão';
        $('training-next').hidden=false;
        $('training-next').focus({preventScroll:true});
      });
      return button;
    });
    $('training-answers').replaceChildren(...buttons);
    $('training-question').focus({preventScroll:true});
  }

  $('training-form').addEventListener('submit',event=>{
    event.preventDefault();
    questions=shuffle(trainingBank[$('training-topic').value][Number($('training-difficulty').value)]);
    missed=[];
    round=0;
    $('training-form').hidden=true;
    $('training-round').hidden=false;
    $('training-reset').hidden=false;
    showQuestion();
  });
  $('training-next').addEventListener('click',()=>{
    if(!answered) return;
    round++;
    if(round<questions.length) {
      showQuestion();
      return;
    }
    $('training-round').hidden=true;
    $('training-result').hidden=false;
    $('training-score').textContent=(questions.length-missed.length)+' de '+questions.length+' acertos';
    $('training-review').open=false;
    $('training-review').hidden=!missed.length;
    $('training-mistakes').replaceChildren(...missed.map(({prompt,correct,answer,explanation})=>{
      const item=make('li');
      item.append(make('strong',prompt),make('span','Sua resposta · '+answer),
        make('span','Correta · '+correct),make('p',explanation));
      return item;
    }));
    $('training-score').focus({preventScroll:true});
  });
  $('training-reset').addEventListener('click',()=>{
    setup();
    $('training-topic').focus();
  });
  $('training-open').addEventListener('click',()=>{
    setup();
    setView('training');
    $('training-topic').focus();
  });
  $('training-back').addEventListener('click',()=>{
    setView('arena');
    $('training-open').focus();
  });
})();
