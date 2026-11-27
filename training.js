'use strict';

const trainingBank = {
  'Ácidos e bases': [
    [
      ['Qual íon está associado a uma solução aquosa ácida?', 'H₃O⁺', ['Na⁺', 'Cl⁻', 'OH⁻'], 'O hidrônio se forma quando a água recebe um próton.'],
      ['Uma solução tem pH 10 a 25 °C. Como ela é classificada?', 'Básica', ['Ácida', 'Neutra', 'Sempre salina'], 'Em água a 25 °C, um pH acima de 7 indica uma solução básica.'],
    ],
    [
      ['Qual é a base conjugada de H₂CO₃?', 'HCO₃⁻', ['CO₃²⁻', 'H₃O⁺', 'OH⁻'], 'A base conjugada resulta da perda de um único próton pelo ácido.'],
      ['Entre pH 3 e pH 5, qual condição tem maior atividade de H₃O⁺?', 'pH 3, por um fator de 100', ['pH 5, por um fator de 100', 'pH 3, por um fator de 2', 'As duas têm a mesma atividade'], 'Dois pontos de diferença correspondem a um fator de 10² na escala logarítmica.'],
    ],
    [
      ['Num tampão ideal, quando as concentrações do ácido fraco e de sua base conjugada são iguais, qual é o pH?', 'pH = pKₐ', ['pH = 7 sempre', 'pH = 2 × pKₐ', 'pH = 14 − pKₐ sempre'], 'O logaritmo da razão entre as concentrações vale zero na equação de Henderson–Hasselbalch.'],
      ['A 25 °C, qual é o pH de NaOH 0,010 mol/L ideal, completamente dissociado?', '12', ['2', '7', '10'], 'A concentração de OH⁻ é 10⁻² mol/L. Assim, pOH = 2 e pH = 14 − 2.'],
    ],
  ],
  'Reações orgânicas': [
    [
      ['Qual produto resulta da hidrogenação completa do eteno?', 'Etano', ['Etino', 'Etanol', 'Metano'], 'O hidrogênio se adiciona à dupla ligação do eteno e produz o alcano com dois carbonos.'],
      ['Qual grupo funcional está presente no metanol, CH₃OH?', 'Hidroxila de álcool', ['Carboxila', 'Éster', 'Amina'], 'No metanol, o grupo –OH está ligado ao carbono saturado do grupo metila.'],
    ],
    [
      ['Na hidrólise ácida completa do etanoato de etila, quais são os produtos orgânicos?', 'Ácido etanoico e etanol', ['Ácido etanoico e metanol', 'Ácido propanoico e etanol', 'Etanal e eteno'], 'A parte acila origina o ácido etanoico e a parte etila ligada ao oxigênio origina o etanol.'],
      ['Qual é a classe da reação em que eteno e bromo formam 1,2-dibromoetano?', 'Adição', ['Eliminação', 'Substituição', 'Hidrólise'], 'Os dois átomos de bromo se ligam aos carbonos que antes formavam a dupla ligação.'],
    ],
    [
      ['Qual caminho é mais favorecido entre os mecanismos SN1 e SN2 para um haleto metílico com um nucleófilo forte?', 'SN2', ['SN1', 'SN1 e SN2 são igualmente favorecidos', 'Nenhum mecanismo é possível'], 'O carbono metílico oferece pouco impedimento ao ataque direto, e um carbocátion metílico seria muito instável.'],
      ['Qual é o produto da redução do grupo carbonila da propanona a álcool?', 'Propan-2-ol', ['Propan-1-ol', 'Propanal', 'Ácido propanoico'], 'A carbonila está no carbono central. Sua redução produz um álcool secundário.'],
    ],
  ],
  'Carboidratos': [
    [
      ['Qual destas moléculas é um açúcar simples?', 'Ribose', ['Celulose', 'Glicogênio', 'Maltose'], 'A ribose é um monossacarídeo de cinco carbonos.'],
      ['Qual polissacarídeo é uma reserva de glicose em animais?', 'Glicogênio', ['Sacarose', 'Celulose', 'Lactose'], 'O glicogênio é um polímero ramificado usado como reserva em tecidos como fígado e músculos.'],
    ],
    [
      ['Quais açúcares são liberados pela hidrólise completa da maltose?', 'Duas moléculas de glicose', ['Glicose e frutose', 'Glicose e galactose', 'Duas moléculas de frutose'], 'A maltose contém duas unidades de glicose unidas por uma ligação glicosídica α(1→4).'],
      ['Em uma solução aquosa de glicose, como se chamam as formas que diferem na configuração do carbono anomérico?', 'Anômeros', ['Isótopos', 'Enantiômeros', 'Isômeros de cadeia'], 'A diferença está no carbono que se torna um novo centro estereogênico no fechamento do anel.'],
    ],
    [
      ['Por que a maltose pode agir como açúcar redutor?', 'Tem um carbono anomérico livre', ['Tem dois carbonos anoméricos presos na ligação', 'Contém uma ligação peptídica', 'É formada apenas de frutose'], 'O carbono anomérico livre permite a abertura de um dos anéis e a formação de uma espécie com grupo aldeído.'],
      ['Qual ligação cria pontos de ramificação no glicogênio?', 'α(1→6)', ['α(1→4)', 'β(1→4)', 'β(1→2)'], 'As cadeias principais usam ligações α(1→4). Uma ligação α(1→6) conecta uma cadeia lateral.'],
    ],
  ],
};
