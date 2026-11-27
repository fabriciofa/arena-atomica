'use strict';

const chemists = {
  curie: {finisher:'Clarão de Rádio', glow:'#caff65', name:'Marie Curie', short:'M. Curie', symbol:'Ra', color:'#89e9fd', hair:'#724b43', style:'bun'},
  mendeleev: {finisher:'Cascata Periódica', glow:'#ffd579', name:'Dmitri Mendeleev', short:'D. Mendeleev', symbol:'Md', color:'#d7b7ff', hair:'#ad9b94', style:'beard'},
  lavoisier: {finisher:'Pulso de Oxigênio', glow:'#85edff', name:'Antoine Lavoisier', short:'A. Lavoisier', symbol:'O', color:'#ffd787', hair:'#dee6ed', style:'wig'},
  franklin: {finisher:'Difração X', glow:'#ff9eea', name:'Rosalind Franklin', short:'R. Franklin', symbol:'C', color:'#9defaa', hair:'#49364d', style:'bob'},
};

const arenas = {
  cristais: {name:'Laboratório de cristais', detail:'Cristalografia', glow:'#b79aff', floor:'#303e61', bg:'#1a2543'},
  eletrolise: {name:'Câmara de eletrólise', detail:'Eletroquímica', glow:'#7feeff', floor:'#2a4d61', bg:'#152c43'},
  estufa: {name:'Estufa molecular', detail:'Química orgânica', glow:'#a4ec9a', floor:'#2f514d', bg:'#1b373c'},
};

function createArena(canvas) {
  const ctx = canvas.getContext('2d');
  const scenery = document.createElement('canvas');
  const sceneryCtx = scenery.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let theme = 'cristais', roster = ['curie','mendeleev'];
  let motion = null, knockout = null, width = 0, height = 0, scale = 1, pixelRatio = 1, cacheKey = '';
  let brush = ctx;

  const project = ([x,y,z]) => [width/2+(x+z*.22)*scale, height*.58+(z*.57-y*.85)*scale];

  function face(points, color, outline) {
    brush.beginPath();
    points.forEach((point,index) => {
      const [x,y] = project(point);
      if(index) brush.lineTo(x,y);
      else brush.moveTo(x,y);
    });
    brush.closePath();
    brush.fillStyle = color;
    brush.fill();
    if(outline) {
      brush.strokeStyle = outline;
      brush.lineWidth = 1;
      brush.stroke();
    }
  }

  function box(x,y,z,w,h,d,top,front=top,side=front) {
    const l=x-w/2, r=x+w/2, b=z-d/2, f=z+d/2, t=y+h;
    face([[l,y,b],[l,y,f],[l,t,f],[l,t,b]],side);
    face([[l,y,f],[r,y,f],[r,t,f],[l,t,f]],front);
    face([[l,t,b],[r,t,b],[r,t,f],[l,t,f]],top);
  }

  function disc(x,y,z,rx,rz,color,outline) {
    const points=Array.from({length:32},(_,i)=>{
      const a=i*Math.PI/16;
      return [x+Math.cos(a)*rx,y,z+Math.sin(a)*rz];
    });
    face(points,color,outline);
  }

  function crystal(x,z,w,h,color,base=0) {
    face([[x-w,base,z],[x,base+h,z-.12],[x+.24*w,base,z+.35]],color);
    face([[x+.24*w,base,z+.35],[x,base+h,z-.12],[x+w,base,z]],'#6778ad');
  }

  function tank(x,z,color) {
    box(x,0,z,1.85,.2,1.3,'#5d7290','#26374f');
    box(x,.2,z,1.52,2.58,1.03,'#6e9db7aa','#253a5599','#53708d');
    box(x,.3,z+.04,1.33,1.08,.98,color+'9e',color+'48');
    box(x,2.77,z,1.83,.22,1.32,'#57728c','#354a63');
    for(const dx of [-.32,.32]) box(x+dx,1.05,z-.1,.09,1.9,.1,'#badef0','#87aabe');
  }

  function plant(x,z,color) {
    box(x,0,z,.88,.59,.8,'#8a8379','#494b61','#35364a');
    const tips=[[-.8,1.3],[.43,1.85],[.84,1.3],[-.35,2.02]];
    for(const [dx,y] of tips) {
      face([[x,.6,z],[x+dx,y,z],[x+dx*.8,y-.49,z+.22]],color);
      face([[x,.6,z],[x+dx,y,z],[x+dx*.42,y-.19,z-.3]],'#52966e');
    }
  }

  function drawScenery() {
    const room = arenas[theme];
    const gradient = brush.createLinearGradient(0,0,0,height);
    gradient.addColorStop(0,'#11192e');
    gradient.addColorStop(.55,room.bg);
    gradient.addColorStop(1,'#273651');
    brush.fillStyle = gradient;
    brush.fillRect(0,0,width,height);

    for(let x=-15;x<15;x+=3) {
      box(x,0,-7.2,2.94,3.2,.45,'#526888','#293753','#202e47');
      box(x,1.5,-6.95,2.2,1.4,.1,room.glow+'38','#16233a');
      box(x,2.54,-6.84,1.8,.05,.08,room.glow+'b0');
      box(x,.54,-6.88,2.49,.13,.12,'#435873');
    }
    box(0,-.58,0,27,.58,13.8,'#435474','#182239','#23334e');
    for(let z=-6;z<7;z++) {
      for(let x=-13;x<13;x++) {
        face([[x,0,z],[x+1,0,z],[x+1,0,z+1],[x,0,z+1]],
          (x+z)%2 ? room.floor : room.floor+'d0','#778ab333');
      }
    }
    for(const z of [-5.5,5.5]) {
      for(let x=-12;x<12;x+=.7) {
        face([[x,.015,z],[x+.27,.015,z],[x+.52,.015,z+.34],[x+.26,.015,z+.34]],room.glow+'65');
      }
    }

    disc(0,.02,.3,7.6,3.3,'#19274080',room.glow+'70');
    disc(0,.025,.3,2.1,1.98,'#243553',room.glow+'a0');
    const center = [0,.05,.3];
    for(let arm=0;arm<3;arm++) {
      const a=arm*2*Math.PI/3;
      const end=[Math.cos(a)*1.2,.05,.3+Math.sin(a)*1.2];
      const [cx,cy]=project(center),[ex,ey]=project(end);
      brush.beginPath();
      brush.moveTo(cx,cy);
      brush.lineTo(ex,ey);
      brush.strokeStyle=room.glow+'99';
      brush.lineWidth=Math.max(1,scale*.09);
      brush.stroke();
      disc(end[0],.055,end[2],.32,.3,room.glow+'bf');
    }
    disc(0,.06,.3,.42,.37,room.glow);
    for(const x of [-9.7,9.7]) {
      if(theme==='eletrolise') {
        tank(x,-3.7,room.glow);
      } else if(theme==='estufa') {
        plant(x,-3.7,room.glow);
        plant(x+1.1,-3.9,room.glow);
      } else {
        box(x,0,-3.7,2,.36,1.35,'#6f81a5','#34425d');
        crystal(x-.6,-3.7,.47,1.3,'#81d6ff',.35);
        crystal(x+.08,-3.67,.54,2.15,room.glow,.35);
        crystal(x+.6,-3.52,.42,1.25,'#8b7df2',.35);
      }
    }
    for(const x of [-11.7,11.7]) {
      box(x,0,3.9,1.45,.85,.9,'#627696','#33435e','#27364e');
      box(x,.51,4.39,.85,.12,.04,room.glow);
    }
  }

  function fighter(id,index,x,z,bob,guard,lean,duck) {
    const chemist=chemists[id];
    const side=index ? -1 : 1;
    const suit=index ? '#fa9d82' : '#72defa';
    const shade=index ? '#b76376' : '#4679b0';
    const skin='#efb996';
    const skinShade='#ce8f78';
    const torsoX=x+lean;
    const headY=2.08+bob-duck;
    disc(x,0,z,.98,.64,'#111a2eab');
    disc(x,.04,z,.75,.52,suit+'29',suit+'a0');
    for(const sign of [-1,1]) {
      box(x+sign*.36,.08,z+.1,.51,.33,.67,'#41516d','#202d43','#17243b');
      box(x+sign*.31,.4,z,.44,.56-duck*.48,.52,'#586580','#303e5b','#263450');
    }
    box(torsoX,.9-duck*.55,z,.97,1.04-duck*.45,.63,'#e8f1fa','#cbd8eb','#8d9fbd');
    box(torsoX,1.08-duck,z+.33,.19,.72,.055,chemist.color,shade);
    box(torsoX-side*.31,1.32+bob-duck,z+.37,.16,.17,.07,suit);
    box(torsoX-side*.66,1.04+bob-duck,z+.04,.4,.74,.47,'#e1ebf9','#a7b7d3','#7a8dab');
    box(torsoX+side*.65,1.28+bob-duck+guard*.2,z+.38,.39,.34,.38,'#d9e4f3','#a8b9d0','#879abb');
    box(torsoX+side*(.75+guard*.19),1.35+bob-duck+guard*.28,z+.59,.4,.37,.38,suit,shade,shade);

    box(torsoX,headY-.17,z,.35,.23,.39,skin,skinShade);
    box(torsoX,headY,z,.8,.69,.69,skin,skinShade,'#bd7e6f');
    box(torsoX,headY+.56,z-.035,.88,.24,.77,chemist.hair);
    if(chemist.style==='bun') box(torsoX,headY+.77,z-.2,.4,.27,.38,chemist.hair);
    if(chemist.style==='beard') box(torsoX,headY-.14,z+.3,.62,.35,.26,chemist.hair);
    if(chemist.style==='wig' || chemist.style==='bob') {
      for(const sign of [-1,1]) box(torsoX+sign*.4,headY+.03,z-.02,.22,.54,.65,chemist.hair);
    }
    for(const dx of [-.16,.16]) box(torsoX+dx+side*.05,headY+.34,z+.36,.08,.085,.025,'#31273c');
    box(torsoX+side*.13,headY+.24,z+.39,.15,.11,.11,skin,skinShade);
  }

  function flask(x,y,z,tilt,special,color) {
    const [sx,sy]=project([x,y,z]);
    const radius=scale*(special ? .98 : .38);
    ctx.save();
    ctx.translate(sx,sy);
    ctx.rotate(tilt);
    ctx.scale(radius,radius);
    if(special) { ctx.shadowColor='#b766ff'; ctx.shadowBlur=scale*.8; }
    ctx.beginPath();
    ctx.moveTo(-.31,-1.65);
    ctx.lineTo(.31,-1.65);
    ctx.lineTo(.31,-.89);
    ctx.bezierCurveTo(1.48,-.56,1.18,1.01,0,1.04);
    ctx.bezierCurveTo(-1.18,1.01,-1.48,-.56,-.31,-.89);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const glass=ctx.createRadialGradient(-.34,-.42,.1,0,0,1.4);
    glass.addColorStop(0,'#f3efffe8');
    glass.addColorStop(1,special ? '#64359a' : '#487d9b');
    ctx.fillStyle=glass;
    ctx.fillRect(-1.4,-1.8,2.8,3);
    const liquid=ctx.createLinearGradient(0,-.17,0,1.06);
    liquid.addColorStop(0,special ? '#f9c6ff' : '#f4ffff');
    liquid.addColorStop(.4,special ? '#b35bff' : color);
    liquid.addColorStop(1,special ? '#6224c8' : '#2c638d');
    ctx.fillStyle=liquid;
    ctx.beginPath();
    ctx.moveTo(-1.35,-.13);
    ctx.quadraticCurveTo(-.53,-.36,.08,-.06);
    ctx.quadraticCurveTo(.61,.18,1.38,-.12);
    ctx.lineTo(1.38,1.3);
    ctx.lineTo(-1.35,1.3);
    ctx.fill();
    ctx.fillStyle='#f9eeff';
    for(const [bx,by,size] of [[-.44,.34,.09],[.14,.12,.115],[.39,.55,.065]]) {
      ctx.beginPath();
      ctx.arc(bx,by,size,0,Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle='#f0e4ff';
    ctx.lineWidth=.09;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0,-1.65,.38,.095,0,0,Math.PI*2);
    ctx.fillStyle='#ede5ff';
    ctx.fill();
    ctx.restore();
  }

  function impact(x,z,age,special,color) {
    const progress=Math.min(1,age/(special ? 1.05 : .58));
    const [sx,sy]=project([x,1.55,z]);
    ctx.save();
    ctx.strokeStyle=color;
    ctx.fillStyle=color;
    const rings=special ? 3 : 1;
    for(let ring=0;ring<rings;ring++) {
      const spread=Math.max(0,progress-ring*.16);
      ctx.globalAlpha=(1-progress)*(.91-ring*.21);
      ctx.lineWidth=Math.max(1,scale*(special?.17:.1)*(1-progress));
      ctx.beginPath();
      ctx.arc(sx,sy,scale*(.38+spread*(special?3.85:1.17)),0,Math.PI*2);
      ctx.stroke();
    }
    for(let i=0;i<(special?32:9);i++) {
      const angle=i*2.399;
      const radius=scale*(.28+progress*(special?2.4:1)*(1+i%4*.24));
      const size=scale*(special?.22:.105)*(1-progress);
      ctx.fillRect(sx+Math.cos(angle)*radius,sy+Math.sin(angle)*radius,size,size);
    }
    ctx.restore();
  }

  function skeleton(x,z) {
    const bone=['#fff4d5','#d4c6aa','#ac9d83'];
    disc(x,0,z,.85,.54,'#101725aa');
    for(const side of [-1,1]) {
      box(x+side*.31,.05,z+.12,.29,.14,.44,...bone);
      box(x+side*.27,.19,z,.14,.66,.17,...bone);
      box(x+side*.57,.76,z+.05,.13,.58,.15,...bone);
      box(x+side*.59,.62,z+.05,.21,.18,.17,...bone);
    }
    box(x,.78,z,.6,.26,.34,...bone);
    box(x,1,z,.17,.78,.19,...bone);
    for(let rib=0;rib<4;rib++) box(x,1.13+rib*.15,z+.17,.73-rib*.025,.075,.26,...bone);
    box(x,1.92,z,.46,.22,.41,...bone);
    box(x,2.13,z,.69,.55,.63,...bone);
    for(const side of [-1,1]) box(x+side*.16,2.28,z+.33,.14,.17,.037,'#222639');
    box(x,2.18,z+.34,.08,.08,.036,'#35334a');
  }

  function finisherEffect(id,x,z,age) {
    const progress=Math.min(1,age/2.25);
    const [sx,sy]=project([x,1.45,z]);
    const color=chemists[id].glow;
    ctx.save();
    ctx.translate(sx,sy);
    ctx.scale(scale,scale);
    ctx.globalAlpha=Math.sin(progress*Math.PI)*.96;
    ctx.strokeStyle=color;
    ctx.fillStyle=color;
    ctx.lineWidth=.091;
    if(id==='curie') {
      for(let orbit=0;orbit<3;orbit++) {
        ctx.beginPath();
        ctx.ellipse(0,0,1.37+progress*1.23,.47+progress*.32,orbit*Math.PI/3+age*.8,0,Math.PI*2);
        ctx.stroke();
      }
      ctx.font='900 .64px system-ui';
      ctx.textAlign='center';
      ctx.fillText('Ra',0,-.77);
    } else if(id==='mendeleev') {
      ctx.font='700 .3px monospace';
      ctx.textAlign='center';
      for(const [index,element] of ['H','C','O','Fe','Au','Md'].entries()) {
        const col=index%3-1;
        const row=Math.floor(index/3);
        const ox=col*(.57+progress*.19);
        const oy=-2.2+row*.55+Math.min(1.7,age*1.24);
        ctx.fillStyle='#322342';
        ctx.fillRect(ox-.25,oy-.23,.5,.46);
        ctx.strokeRect(ox-.25,oy-.23,.5,.46);
        ctx.fillStyle=color;
        ctx.fillText(element,ox,oy+.11);
      }
    } else if(id==='lavoisier') {
      for(let molecule=0;molecule<8;molecule++) {
        const angle=molecule*Math.PI/4+age*.8;
        const radius=.55+progress*2.05;
        const cx=Math.cos(angle)*radius, cy=Math.sin(angle)*radius;
        for(const offset of [-.14,.14]) {
          ctx.beginPath();
          ctx.arc(cx+offset,cy,.18,0,Math.PI*2);
          ctx.stroke();
        }
      }
    } else {
      for(const angle of [-Math.PI/4,Math.PI/4]) {
        for(let n=-4;n<=4;n++) {
          const r=n*(.32+progress*.27);
          ctx.beginPath();
          ctx.arc(Math.cos(angle)*r,Math.sin(angle)*r,.072+Math.abs(n)*.023,0,Math.PI*2);
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.arc(0,0,.57+progress*.56,0,Math.PI*2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function paint(now) {
    const rect=canvas.getBoundingClientRect();
    if(rect.width && rect.height) {
      width=rect.width;
      height=rect.height;
      pixelRatio=Math.min(devicePixelRatio,2);
      scale=Math.min(width/29,height/12);
      const key=[width,height,pixelRatio,theme].join(':');
      if(key!==cacheKey) {
        cacheKey=key;
        canvas.width=scenery.width=Math.round(width*pixelRatio);
        canvas.height=scenery.height=Math.round(height*pixelRatio);
        brush=sceneryCtx;
        brush.setTransform(pixelRatio,0,0,pixelRatio,0,0);
        drawScenery();
        brush=ctx;
      }
      ctx.setTransform(1,0,0,1,0,0);
      ctx.drawImage(scenery,0,0);
      ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);

      const elapsed=motion ? Math.max(0,(now-motion.at)/1000) : Infinity;
      const specials=motion?.specials || [false,false];
      const hasSpecial=specials.some(Boolean);
      const finalMove=motion?.finisher;
      const hitAt=finalMove ? 1.16 : hasSpecial ? .89 : .64;
      const swing=reduce.matches ? 0 : Math.sin(Math.min(1,elapsed/1.15)*Math.PI);
      const flinch=reduce.matches || elapsed<hitAt ? 0 :
        Math.sin(Math.min(1,(elapsed-hitAt)/.55)*Math.PI);
      const eliminated=finalMove && elapsed>=hitAt ? motion.damaged : knockout;
      const pose=roster.map((id,index)=>{
        const struck=motion?.damaged===index;
        const attacking=motion?.correct[index];
        const dodge=motion?.dodge;
        const direction=index ? -1 : 1;
        const retreat=struck ? flinch*.54 : dodge ? swing*.44 : 0;
        return {
          id,index,
          bob:reduce.matches ? 0 : Math.sin(now/290+index)*.055,
          x:roster.length===1 ? 0 : direction*(-3.65+(attacking ? swing*.36 : 0)-retreat),
          z:.65+(dodge ? swing*(index ? 1.4 : -1.4) : 0),
          guard:attacking?swing:0,
          lean:direction*(attacking ? swing*.12 : -retreat*.29),
          duck:dodge?swing*.6:struck?flinch*.22:0,
        };
      });
      pose.sort((a,b)=>a.z-b.z).forEach(p=>{
        if(p.index===eliminated) skeleton(p.index ? 3.65 : -3.65,.65);
        else if(roster.length===1) {
          const [cx,cy]=project([p.x,0,p.z]);
          ctx.save();
          ctx.translate(cx,cy);
          ctx.scale(1.75,1.75);
          ctx.translate(-cx,-cy);
          fighter(p.id,p.index,p.x,p.z,p.bob,p.guard,p.lean,p.duck);
          ctx.restore();
        } else fighter(p.id,p.index,p.x,p.z,p.bob,p.guard,p.lean,p.duck);
      });

      if(motion && !finalMove) motion.correct.forEach((fired,index)=>{
        if(!fired) return;
        const special=specials[index];
        const launch=.14;
        const arrival=special ? .89 : .64;
        if(elapsed<launch || elapsed>arrival) return;
        const progress=(elapsed-launch)/(arrival-launch);
        const direction=index ? -1 : 1;
        const x=direction*(-2.78+progress*6.42);
        const y=1.65+(reduce.matches ? 0 : Math.sin(progress*Math.PI)*(special?1.38:.88));
        flask(x,y,index ? .98 : .4,reduce.matches ? 0 : direction*progress*Math.PI*(special?1.13:1.36),
          special,index ? '#ffb69a' : '#77ecff');
      });

      if(finalMove && !reduce.matches) {
        const x=motion.damaged ? 3.65 : -3.65;
        finisherEffect(finalMove,x,.65,elapsed);
        if(elapsed>=hitAt && elapsed<hitAt+1.05) {
          impact(x,.65,elapsed-hitAt,true,chemists[finalMove].glow);
        }
      } else if(motion && !finalMove && !reduce.matches) motion.correct.forEach((fired,index)=>{
        if(!fired) return;
        const special=specials[index];
        const age=elapsed-(special ? .89 : .64);
        if(age<0 || age>(special ? 1.05 : .58)) return;
        const color=special ? '#d897ff' : index ? '#ffb6a1' : '#99eaff';
        const z=motion.dodge ? (index ? 2.1 : -.85) : .7;
        impact(index ? -3.65 : 3.65,z,age,special,color);
      });

      if(motion && motion.damaged!==null && elapsed>=hitAt && elapsed<hitAt+1.2) {
        const x=motion.damaged ? 3.65 : -3.65;
        const [sx,sy]=project([x,2.95+(reduce.matches ? 0 : (elapsed-hitAt)*.62),.65]);
        ctx.fillStyle=finalMove ? chemists[finalMove].glow : hasSpecial ? '#ebbdff' : '#ffd5d9';
        ctx.font='900 '+Math.round(scale*.82)+'px system-ui';
        ctx.textAlign='center';
        ctx.strokeStyle='#152034';
        ctx.lineWidth=3;
        ctx.strokeText('−'+motion.damage,sx,sy);
        ctx.fillText('−'+motion.damage,sx,sy);
      }
    }
    requestAnimationFrame(paint);
  }

  requestAnimationFrame(paint);
  return {
    show(arena,players) { theme=arena; roster=players; },
    animate(result) {
      knockout=null;
      motion={...result,damage:result.damage ?? 25,dodge:result.correct.every(Boolean),at:performance.now()};
    },
    showKnockout(side) { motion=null; knockout=side; },
    clear() { motion=null; knockout=null; },
  };
}
