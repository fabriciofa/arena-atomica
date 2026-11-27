'use strict';

const study = (() => {
  const lessons = {
    'Ácidos e bases': {
      concept:'Um ácido de Brønsted–Lowry doa um próton. Uma base aceita esse próton. As duas espécies de um par conjugado diferem por um H⁺.',
      example:'Na reação NH₃ + H₂O ⇌ NH₄⁺ + OH⁻, a amônia aceita um próton da água. O íon NH₄⁺ é o ácido conjugado da amônia.',
      takeaway:'Para identificar o par conjugado, acompanhe o próton e confira a carga antes e depois.',
    },
    'Reações orgânicas': {
      concept:'Compare os reagentes e os produtos para perceber quais ligações mudaram. Uma adição incorpora grupos a uma insaturação. Uma eliminação pode criar uma insaturação. Uma substituição troca um grupo por outro.',
      example:'Na hidrogenação do prop-1-eno, os átomos de hidrogênio se adicionam aos carbonos da ligação dupla. O produto é propano.',
      takeaway:'Comece pela mudança na estrutura do produto. Identificar a classe da reação vem antes de explicar o mecanismo.',
    },
    'Carboidratos': {
      concept:'Monossacarídeos têm uma unidade de açúcar. Dissacarídeos têm duas. Polissacarídeos têm muitas. As unidades se unem por ligações glicosídicas.',
      example:'A amilose tem cadeias de glicose com ligações α(1→4). A celulose também é feita de glicose, mas suas ligações β(1→4) favorecem cadeias estendidas que se associam em fibras.',
      takeaway:'O tipo de ligação muda a forma e as propriedades do carboidrato, mesmo quando as unidades são iguais.',
    },
    'Bioquímica e proteínas': {
      concept:'A estrutura primária de uma proteína é a sequência de aminoácidos. As estruturas secundária e terciária descrevem o dobramento. A quaternária descreve a associação de várias cadeias.',
      example:'Ao aquecer a clara do ovo, proteínas como a ovalbumina perdem parte do dobramento original e se agregam. A clara fica opaca e firme.',
      takeaway:'Desnaturar uma proteína altera sua conformação. Isso não exige quebrar as ligações peptídicas que formam a sequência.',
    },
    'Ácidos nucleicos': {
      concept:'Cada nucleotídeo reúne uma base nitrogenada, um açúcar e fosfato. O DNA usa desoxirribose. O RNA usa ribose.',
      example:'Se uma amostra de DNA de fita dupla tem 24% de adenina, também tem 24% de timina. Os 52% restantes se dividem igualmente entre citosina e guanina, com 26% de cada.',
      takeaway:'Em DNA de fita dupla com pareamento canônico, A e T aparecem em proporções iguais, assim como C e G.',
    },
  };
  const select=$('study-topic');
  select.append(...Object.keys(lessons).map(topic=>new Option(topic,topic)));

  function renderLesson() {
    const lesson=lessons[select.value];
    $('study-concept').textContent=lesson.concept;
    $('study-example').textContent=lesson.example;
    $('study-takeaway').textContent=lesson.takeaway;
    $('study-practice').hidden=!state?.authenticated || !Object.hasOwn(trainingBank,select.value);
  }

  function open(topic) {
    if(Object.hasOwn(lessons,topic)) select.value=topic;
    renderLesson();
    setView('study');
    select.focus();
  }

  select.addEventListener('change',renderLesson);
  $('study-open').addEventListener('click',()=>open());
  $('study-practice').addEventListener('click',()=>practice.open(select.value));
  $('study-back').addEventListener('click',()=>setView('arena'));
  return {open};
})();
