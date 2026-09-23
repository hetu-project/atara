/* The consensus ring and constellation chart, taken verbatim from console.html's consensusRing /
   consensusNet. These two charts are the visual substance of the right column, drawn frame by frame on a
   canvas -- rewritten they would not be the same product, so they are carried over as-is with only a thin
   React wrapper around them. */
/* eslint-disable */
// @ts-nocheck
function consensusRing(canvas, agents, startDelay, stepMs, score, center, passed, threshold, settled){
  /* `score||90` used to sit here as a default. It also swallowed a real 0:
     the ring is built once when a run starts, and at that instant the score is
     still 0 — so every assessment drew 90 no matter what came back, and a
     counterparty with a low score was shown the safest number on screen.
     `??` defaults only when nothing was passed at all. */
  score = score ?? 0;
  const DPR=Math.min(2,window.devicePixelRatio||1), CSS=220;
  canvas.width=CSS*DPR; canvas.height=CSS*DPR;
  const g=canvas.getContext('2d'); g.scale(DPR,DPR);
  const cx=CSS/2, cy=CSS/2, R1=76, R2=94;
  const N=agents.length, TICKS=126, GAP=2;                 /* 18 ticks per sector, 2 tick slots of gap between sectors */
  const per=Math.floor(TICKS/N);
  const seed=i=>{const x=Math.sin(i*127.1+311.7)*43758.5;return x-Math.floor(x)};
  const css=getComputedStyle(document.documentElement);
  const C={ink:css.getPropertyValue('--ink').trim(), faint:css.getPropertyValue('--faint-2').trim(),
           acc:css.getPropertyValue('--accent').trim(), warn:css.getPropertyValue('--warn').trim(),
           hair:css.getPropertyValue('--line-strong').trim(), mute:css.getPropertyValue('--mute').trim()};
  const a0=-Math.PI/2;                                     /* starts at 12 o'clock, clockwise */
  const tickAngle=k=>a0 + (k/TICKS)*Math.PI*2;
  const sectorOf=k=>Math.min(N-1, Math.floor(k/per));
  const inGap=k=>(k%per)>=per-GAP && sectorOf(k)<N-1;      /* leave a gap between sectors */
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total=N*stepMs;                                    /* how long one full sweep takes */

  /* Ticks are no longer a binary lit/unlit; they carry heat:
       glow  -- the afterglow just behind the scanning head, decaying back over a dozen-odd ticks into a comet tail
       burst -- the whole sector blooming at the moment this sector's vote lands
     Both kinds of heat only add length, line width and glow, never colour -- colour is semantics (pass /
     questionable), heat is time, and the two must not be expressed through one channel. */
  function tick(k,on,warn,glow,burst){
    const a=tickAngle(k), r=seed(k);
    const heat=Math.max(glow||0,burst||0);
    const len=13+r*9+heat*8;                               /* voiceprint-style length variation (fixed seed, no flicker) */
    /* The canvas radius is only 110: ticks lengthened by heat have to be clamped, or they are sliced flat at the edge */
    const rIn=R1+(on?0:4), rOut=Math.min(108, R1+len+(on?5:0));
    const col=on?(warn?C.warn:C.acc):C.hair;
    g.strokeStyle=col;
    g.globalAlpha=on?1:.55;
    g.lineWidth=on?1.6+heat*1.4:1;
    if(on&&heat>.02){ g.shadowBlur=14*heat; g.shadowColor=col; }
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*rIn,  cy+Math.sin(a)*rIn);
    g.lineTo(cx+Math.cos(a)*rOut, cy+Math.sin(a)*rOut);
    g.stroke();
    g.shadowBlur=0; g.globalAlpha=1;
  }
  /* Central underglow: a diffuse ring that deepens with voting progress. It is not decoration --
     "brighter the further it gets" is itself the progress, and one glance at the brightness says how far along it is */
  function core(prog){
    if(prog<=0)return;
    const gr=g.createRadialGradient(cx,cy,0,cx,cy,R1+6);
    gr.addColorStop(0,C.acc); gr.addColorStop(1,'transparent');
    g.globalAlpha=.12*prog; g.fillStyle=gr;
    g.beginPath(); g.arc(cx,cy,R1+6,0,Math.PI*2); g.fill();
    g.globalAlpha=1;
  }
  function threshold(){                                    /* consensus threshold of 6/7 votes: solid triangle marker + short line */
    const a=a0+Math.PI*2*(6/7);
    const r=R2+10;
    g.fillStyle=C.ink; g.strokeStyle=C.ink; g.lineWidth=1.2;
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*(R1-6), cy+Math.sin(a)*(R1-6));
    g.lineTo(cx+Math.cos(a)*(R1-13),cy+Math.sin(a)*(R1-13));
    g.stroke();
    const tx=cx+Math.cos(a)*(r+4), ty=cy+Math.sin(a)*(r+4);
    g.save(); g.translate(tx,ty); g.rotate(a+Math.PI/2);
    g.beginPath(); g.moveTo(0,-4); g.lineTo(3.5,2.5); g.lineTo(-3.5,2.5); g.closePath(); g.fill();
    g.restore();
    g.font='600 8.5px Inter,system-ui,sans-serif'; g.fillStyle=C.mute;
    g.textAlign='center';
    g.fillText('6/7', cx+Math.cos(a)*(r+16), cy+Math.sin(a)*(r+16)+3);
  }
  function centre(n,done){
    g.textAlign='center';
    if(center){
      /* Release ring: while votes are incomplete the centre only reports progress; once they are in, the measured value lands together with the threshold it is measured against */
      g.font='600 '+(done?String(center.big).length>6?'20px':'28px':'26px')+' Inter,system-ui,sans-serif';
      g.fillStyle=C.ink;
      g.fillText(done?String(center.big):`${n}/${N}`, cx, cy);
      /* The centre is only 152px across, enough for one large figure plus one small line.
         The consensus row and gate checklist below the verdict have already said the rest; no repetition here */
      g.font='500 10px Inter,system-ui,sans-serif'; g.fillStyle=done?C.mute:C.faint;
      g.fillText(done?center.line:`${n}/${N} checks in`, cx, cy+19);
      return;
    }
    /* The centre is the conclusion itself: the AI's risk score, converging as votes come in; the vote count recedes into small text */
    g.font='600 34px Inter,system-ui,sans-serif';
    g.fillStyle=C.ink;
    g.fillText(String(done?score:Math.round(score*n/N)), cx, cy);
    g.font='500 9.5px Inter,system-ui,sans-serif'; g.fillStyle=C.mute;
    g.fillText('Trust Gate · higher is safer', cx, cy+15);
    g.font='500 10px Inter,system-ui,sans-serif'; g.fillStyle=done?C.mute:C.faint;
    /* How many actually agreed, not N of N.
       This read `${N}/${N}` regardless, so a run that passed 5 of 7 and was
       held for review still printed "✓ 7/7 agree" — directly contradicting the
       verdict spelled out two lines below it. */
    const ok = passed == null ? N : passed;
    const mark = threshold != null && ok >= threshold ? '✓ ' : '';
    g.fillText(done?`${mark}${ok}/${N} agree`:`${n}/${N} agents voted`, cx, cy+30);
  }
  function needle(a){
    /* The scanning head has to glow too, otherwise the brightest part of the comet is its tail */
    g.shadowBlur=12; g.shadowColor=C.acc;
    g.strokeStyle=C.ink; g.lineWidth=1.4;
    g.beginPath();
    g.moveTo(cx+Math.cos(a)*(R1-10), cy+Math.sin(a)*(R1-10));
    g.lineTo(cx+Math.cos(a)*(R2+8),  cy+Math.sin(a)*(R2+8));
    g.stroke();
    g.fillStyle=C.ink;
    g.beginPath(); g.arc(cx+Math.cos(a)*(R2+8), cy+Math.sin(a)*(R2+8), 2.6, 0, 7); g.fill();
    g.shadowBlur=0;
  }
  function ripple(rr,alpha){
    g.strokeStyle=C.acc; g.globalAlpha=alpha; g.lineWidth=1;
    g.beginPath(); g.arc(cx,cy,rr,0,Math.PI*2); g.stroke(); g.globalAlpha=1;
  }
  const TAIL=15, BURST=per*.55;                            /* comet tail length and bloom decay span (in ticks) */
  function frame(prog,rip){                                /* prog: 0..1 sweep progress; rip: ripple 0..1 */
    g.clearRect(0,0,CSS,CSS);
    const litTo=prog*TICKS;
    core(prog);
    /* Lit ticks use additive blending: overlapping them genuinely compounds the brightness, whereas
       source-over only covers one with another and the glow smears into a dead white patch */
    for(let k=0;k<TICKS;k++){
      if(inGap(k))continue;
      const sec=sectorOf(k), on=k<litTo;
      /* Afterglow: brightest nearest the scanning head, decaying to zero fifteen ticks back.
         Only while the sweep is running -- still lit after it freezes, the final sector would read as "loading" forever */
      const glow=(on&&prog<1)?Math.max(0,1-(litTo-k)/TAIL):0;
      /* Bloom: at the moment this sector's last tick is swept, the whole sector lights up at once */
      const since=litTo-(sec+1)*per;
      const burst=(on&&prog<1&&since>=0&&since<BURST)?1-since/BURST:0;
      const hot=on&&(glow>.02||burst>.02);
      if(hot)g.globalCompositeOperation='lighter';
      tick(k, on, agents[sec].v!=='Pass', glow, burst);   /* Pass = accent colour, note/flag = warn colour */
      if(hot)g.globalCompositeOperation='source-over';
    }
    threshold();
    const votes=Math.min(N, Math.floor(prog*N + 1e-6));
    if(prog>=1){ centre(N,true); if(rip>0&&rip<1) ripple(R2+14+rip*26, .5*(1-rip)); }
    else { centre(votes,false); needle(tickAngle(litTo)); }
  }
  /* Empty state: draw one frame of "not started yet" and stop, without starting a loop.
     Pass null for startDelay -- only consensusRing honours that convention */
  /* A stored assessment is a look back, not a run: draw the finished frame and stop. Without this the only ways
     in were "idle" (startDelay null, which paints 0/0 whatever score it was given) and "animate from zero", and a
     record rendered through the idle path showed a grey 0 next to a verdict that said 66. */
  if(settled){ frame(1,1); return; }
  if(startDelay===null){ frame(0,0); return; }
  if(reduce){ frame(1,1); return; }
  const t0=performance.now()+startDelay;
  (function loop(now){
    const t=now-t0;
    if(t<0){ frame(0,0); requestAnimationFrame(loop); return; }
    if(t<=total){ frame(Math.min(1,t/total),0); requestAnimationFrame(loop); return; }
    const rt=(t-total)/700;
    frame(1, Math.min(1,rt));
    if(rt<1 && canvas.isConnected) requestAnimationFrame(loop);
    else frame(1,1);
  })(performance.now());
}

function consensusNet(canvas, agents, base, voteStep, freezeAt, idle, hOpt){
  const DPR=Math.min(2,window.devicePixelRatio||1);
  /* Stacked vertically this fills the parent's width (the old -250 made room for a ring beside it). Lower
     bound 300, below which the orbits touch the edges */
  /* One canvas has to swap back and forth between standing by and running, so the old rAF loop must be
     invalidated, or two loops draw onto one canvas and their frames overwrite each other */
  const gen=(canvas._gen=(canvas._gen||0)+1);
  const alive=()=>canvas.isConnected && canvas._gen===gen;
  /* Never exceed the parent. A hard floor wider than its container does not make the chart bigger, it makes it
     clipped -- .rsplit>.rtable is overflow:hidden, so the overhang is simply lost. Below the old 300 floor the
     orbits still fit: their radii come from SC, which is derived from H, not from W. */
  const measure=()=>Math.min(560,canvas.parentElement?.clientWidth||460);
  let W=measure();
  /* The height can be passed in. The orbit scale is not scaled proportionally as H/292 would -- that leaves a
     ring of wasted space. Instead the outermost radius is derived from the available height: an outer diameter
     of 2x106xSC plus the 44 reserved for labels fills H exactly. The default (no H passed) is unchanged, so the
     running chart is unaffected. */
  const H=hOpt||292;
  const SC=hOpt ? Math.max(.6,Math.min(1.3,(H-44)/212)) : 1;
  const g=canvas.getContext('2d');
  const fit=()=>{
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    canvas.width=W*DPR; canvas.height=H*DPR;
    g.setTransform(1,0,0,1,0,0); g.scale(DPR,DPR);   /* changing canvas.width resets the transform */
  };
  fit();
  const css=getComputedStyle(document.documentElement);
  const C={ink:css.getPropertyValue('--ink').trim(), mute:css.getPropertyValue('--mute').trim(),
           faint:css.getPropertyValue('--faint-2').trim(), acc:css.getPropertyValue('--accent').trim(),
           warn:css.getPropertyValue('--warn').trim(), hair:css.getPropertyValue('--line-strong').trim(),
           green:css.getPropertyValue('--green').trim(),
           paper:css.getPropertyValue('--paper').trim()};
  /* cx follows the column width: folding or expanding the left column changes the right column's width, so the
     canvas has to be remeasured and redrawn, or it stays at the old width -- wider than its container when
     expanded, which overflows horizontally.
     No ResizeObserver: like rAF it is tied to the rendering lifecycle and never fires while the tab is not compositing.
     Instead "whatever action changed the column width" calls refit directly -- whoever changed it is responsible for
     the redraw, which is deterministic. */
  const N=agents.length; let cx=W/2; const cy=H/2;
  const reduceNet=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastT=0;
  /* Orbital time and phase time are kept apart: the phase (who has woken, how far the edges have grown, who has
     voted) has to be freezable, and the orbit must not be -- freeze it and motion has to be manufactured some other
     way, which is where the back-and-forth came from.
     When ORB_T is not null, node positions follow it alone. */
  let ORB_T=null;
  canvas._refit=()=>{
    const nw=measure(); if(nw===W)return;
    W=nw; cx=W/2; fit(); draw(lastT);   /* changing canvas.width clears the canvas, so a frame has to be redrawn */
  };
  addEventListener('resize',()=>canvas._refit&&canvas._refit());
  /* Timeline: wake -> confer -> vote -> lock */
  const T={wake:1400, talk:4600, voteStep, votes:N*voteStep};
  T.voteStart=T.talk;  T.lockAt=T.voteStart+T.votes;  T.end=T.lockAt+900;
  const rnd=i=>{const x=Math.sin(i*93.7+41.3)*43758.5;return x-Math.floor(x)};
  /* Three circular orbits; each node carries its own orbital angular velocity (inner fast, outer slow, one of them reversed) */
  const ORB=[{r:44*SC,w:.00052},{r:76*SC,w:-.00034},{r:106*SC,w:.00022}];
  const RING_OF=[1,2,0,2,1,2,0];                    /* ring assignment pattern, reused modulo when there are fewer nodes */
  const nodes=agents.map((a,i)=>{
    const o=ORB[RING_OF[i%RING_OF.length]];
    return {a, o, r:(8+rnd(i+2)*5)*Math.max(.72,SC),
      a0:rnd(i+11)*Math.PI*2,
      born:200+i*170};
  });
  const npos=(n,t)=>{const th=n.a0+n.o.w*t;
    return {x:cx+Math.cos(th)*n.o.r, y:cy+Math.sin(th)*n.o.r}};
  /* Edges: grown one at a time during the conferring phase (connections appear while it rotates) */
  /* Edges are generated from the actual node count: one adjacency ring plus a few chords.
     Hardcoded indices for 7 nodes go out of bounds with 5 agents, and the exception aborts the whole draw --
     after which neither the nodes nor the names following the edges can be drawn at all */
  const ring=[...Array(N)].map((_,i)=>[i,(i+1)%N]);
  const chords=[];
  for(let i=0;i<N;i++){const j=(i+Math.floor(N/2))%N; if(i<j)chords.push([i,j]);}
  const edges=[...ring,...chords].map((e,k)=>({e, born:T.wake+k*380}));
  /* Conferring pulses: spanning the conferring phase and the first half of voting */
  const msgs=[];
  for(let k=0;k<34;k++){
    msgs.push({t0:T.wake+400+rnd(k+20)*(T.voteStart+T.votes*.5-T.wake-800),
      dur:520+rnd(k+30)*420, ei:Math.floor(rnd(k+40)*edges.length), flip:rnd(k+50)>.5});
  }
  const ease=x=>1-Math.pow(1-x,3);
  function draw(t){
    lastT=t;
    g.clearRect(0,0,W,H);
    /* Dashed circular orbits */
    g.setLineDash([2,4]); g.strokeStyle=C.hair; g.lineWidth=1; g.globalAlpha=.9;
    ORB.forEach(o=>{g.beginPath();g.arc(cx,cy,o.r,0,Math.PI*2);g.stroke()});
    g.setLineDash([]); g.globalAlpha=1;
    const done=t>=T.end;
    const tt=done?T.end:t;                          /* orbiting stops after the final state */
    const OT=ORB_T!=null?ORB_T:Math.max(0,tt);
    const P=nodes.map(n=>npos(n,OT));
    /* Node hit regions exposed to the click layer (CSS pixel coordinates, the same system as offsetX/Y) */
    canvas._hits=nodes.map((n,i)=>({i, x:P[i].x, y:P[i].y, r:n.r}));
    canvas._done=done;
    /* While standing by, no edges, no pulses and no central core -- "standing by" is just a few spheres drifting
       on their own orbits. Once work really starts, edges, vote pulses and the core grow in together, and that contrast is itself information. */
    /* An edge's colour = whether the two agents on that link agree:
       neither has spoken -> dim; one has -> accent; both passed -> green; either objects -> warning.
       Colour here is the conclusion, not decoration -- one glance at the whole web says whether anyone disagrees. */
    const edgeCol=(i,j)=>{
      const vi=tt>=T.voteStart+i*voteStep, vj=tt>=T.voteStart+j*voteStep;
      if(!vi&&!vj)return {c:C.hair,a:.45};
      if((vi&&agents[i].v!=='Pass')||(vj&&agents[j].v!=='Pass'))return {c:C.warn,a:.62};
      if(vi&&vj)return {c:C.green,a:.5};
      return {c:C.acc,a:.5};
    };
    if(!idle) edges.forEach(({e:[i,j],born})=>{
      if(tt<born)return;
      /* "Suddenly connected": the line grows from one end to the other over 260ms, with a bright head at its tip.
         It used to fade the whole line in at once -- that is an appearance, not a connection. */
      const k=reduceNet?1:Math.min(1,(tt-born)/260);
      const ec=edgeCol(i,j);
      const hx=P[i].x+(P[j].x-P[i].x)*k, hy=P[i].y+(P[j].y-P[i].y)*k;
      g.strokeStyle=ec.c; g.globalAlpha=ec.a; g.lineWidth=1;
      g.beginPath(); g.moveTo(P[i].x,P[i].y); g.lineTo(hx,hy); g.stroke();
      if(k<1){
        g.globalCompositeOperation='lighter';
        g.globalAlpha=1; g.fillStyle=C.acc; g.shadowBlur=9; g.shadowColor=C.acc;
        g.beginPath(); g.arc(hx,hy,2.3,0,Math.PI*2); g.fill();
        g.shadowBlur=0; g.globalCompositeOperation='source-over';
      }
    });
    g.globalAlpha=1;
    /* Ambient data flow: one point of light travels back and forth at constant speed along every edge.
       The old msgs were discrete events (who said something to whom); this is the background hum of "the link is
       alive", and only the two together look like a network genuinely carrying data. */
    if(!idle && !done && !reduceNet) {
      g.globalCompositeOperation='lighter';
      edges.forEach(({e:[i,j],born},k)=>{
        if(tt<born+260)return;
        const ph=((tt-born)/2600+k*.137)%1;
        const kk=ph<.5?ph*2:2-ph*2;                     /* 0 -> 1 -> 0 round trip, decelerating naturally at the endpoints */
        const ec=edgeCol(i,j);                          /* the point matches the edge's colour: what it carries is that link's conclusion */
        const x=P[i].x+(P[j].x-P[i].x)*kk, y=P[i].y+(P[j].y-P[i].y)*kk;
        g.globalAlpha=.6; g.fillStyle=ec.c;
        g.shadowBlur=7; g.shadowColor=ec.c;
        g.beginPath(); g.arc(x,y,1.6,0,Math.PI*2); g.fill();
        /* Arrival: a ring splashes where the information lands. Without it the point is merely sliding;
           with it, "delivered" becomes legible. */
        let near=0, tgt=-1;
        if(ph<.5 && kk>.88){near=(kk-.88)/.12; tgt=j}
        else if(ph>=.5 && kk<.12){near=(.12-kk)/.12; tgt=i}
        if(near>0){
          g.strokeStyle=ec.c; g.globalAlpha=.55*near; g.lineWidth=1.2;
          g.beginPath(); g.arc(P[tgt].x,P[tgt].y,nodes[tgt].r+2+(1-near)*7,0,Math.PI*2); g.stroke();
        }
      });
      g.shadowBlur=0; g.globalAlpha=1; g.globalCompositeOperation='source-over';
    }
    /* Conferring pulses */
    if(!done && !idle) msgs.forEach(m=>{
      const mt=(t-m.t0)/m.dur; if(mt<0||mt>1)return;
      const ed=edges[m.ei]; if(t<ed.born+300)return;
      let [i,j]=ed.e; if(m.flip){const q=i;i=j;j=q}
      const k=ease(mt);
      g.fillStyle=C.ink;
      g.beginPath(); g.arc(P[i].x+(P[j].x-P[i].x)*k, P[i].y+(P[j].y-P[i].y)*k, 1.8, 0, 7); g.fill();
    });
    /* Vote pulses: fly towards the centre within 480ms of a vote */
    nodes.forEach((n,i)=>{
      const vt=t-(T.voteStart+i*voteStep);
      if(!done&&vt>=0&&vt<=480){
        const k=ease(vt/480), x=P[i].x+(cx-P[i].x)*k, y=P[i].y+(cy-P[i].y)*k;
        g.strokeStyle=C.acc; g.globalAlpha=.45; g.lineWidth=1;
        g.beginPath(); g.moveTo(P[i].x,P[i].y); g.lineTo(x,y); g.stroke(); g.globalAlpha=1;
        g.fillStyle=C.acc; g.beginPath(); g.arc(x,y,2.4,0,7); g.fill();
      }
    });
    /* Lock flash */
    const ft=(t-T.lockAt)/520;
    if(ft>0&&ft<1){
      g.strokeStyle=C.acc; g.globalAlpha=.7*(1-ft); g.lineWidth=1.5;
      edges.forEach(({e:[i,j]})=>{g.beginPath();g.moveTo(P[i].x,P[i].y);g.lineTo(P[j].x,P[j].y);g.stroke()});
      g.globalAlpha=1;
    }
    /* Nodes: filled circles (GLASS style). Thinking = grey; voted = ink/white fill, note = warn; radius pops at the instant of voting */
    nodes.forEach((n,i)=>{
      if(tt<n.born)return;
      const bi=Math.min(1,(tt-n.born)/400);
      const vAt=T.voteStart+i*voteStep, voted=tt>=vAt, warn=n.a.v!=='Pass';
      let rr=n.r*bi;
      if(voted&&!done){const pk=(tt-vAt)/380; if(pk<1) rr*=1+.28*Math.sin(Math.min(1,pk)*Math.PI);}
      g.fillStyle=voted?(warn?C.warn:C.ink):C.faint;
      g.globalAlpha=voted?1:.9;
      /* The glow is strongest at the instant of voting and then settles to an underglow -- "has spoken" and "still looking" stay distinguishable at a glance */
      if(voted&&!reduceNet){
        const fresh=Math.max(0,1-(tt-vAt)/900);
        g.shadowBlur=7+fresh*16; g.shadowColor=warn?C.warn:C.acc;
      }
      g.beginPath(); g.arc(P[i].x,P[i].y,rr,0,Math.PI*2); g.fill();
      g.shadowBlur=0; g.globalAlpha=1;
      /* Names follow their node; after a vote lands, an extra line appears under the name */
      g.font='600 9.5px Inter,system-ui,sans-serif';
      g.fillStyle=voted?C.ink:C.mute;
      /* Names are placed outward along the "centre -> node" direction, with the Agent suffix dropped:
         pinned directly below the node with full names, seven labels pile into one clump in a narrow column */
      const dx=P[i].x-cx, dy=P[i].y-cy, dl=Math.hypot(dx,dy)||1;
      const ox=dx/dl*(rr+9), oy=dy/dl*(rr+9);
      const txt=n.a.n.replace(/ Agent$/,'');
      let al = ox>6?'left' : ox<-6?'right' : 'center', lx=P[i].x+ox;
      /* Outer-ring nodes placed outward would push past the canvas -- past the edge, the label flips to the node's inner side */
      const tw=g.measureText(txt).width;
      if(al==='left'  && lx+tw>W-4){al='right'; lx=P[i].x-ox}
      if(al==='right' && lx-tw<4)  {al='left';  lx=P[i].x-ox}
      if(al==='center')lx=Math.min(W-tw/2-4,Math.max(tw/2+4,lx));
      g.textAlign=al;
      /* Vertically it has to be clamped too: labels placed outward from the topmost and bottommost nodes would stick out and get cut in half */
      const ly=Math.min(H-4,Math.max(10,P[i].y+oy+(oy>0?9:0)));
      g.fillText(txt, lx, ly);
    });
    /* Central consensus core: solid, growing one step per vote; once locked it gets an outline and a checkmark. No core while standing by */
    if(idle) return;
    const nv=Math.max(0,Math.min(N, t<T.voteStart?0:Math.floor((t-T.voteStart)/voteStep)+1));
    const cr=6+(done?N:nv)*.85;
    g.fillStyle=C.ink; g.beginPath(); g.arc(cx,cy,cr,0,Math.PI*2); g.fill();
    if(done||t>=T.lockAt){
      g.strokeStyle=C.ink; g.globalAlpha=.5; g.lineWidth=1;
      g.beginPath(); g.arc(cx,cy,cr+5,0,Math.PI*2); g.stroke(); g.globalAlpha=1;
      g.fillStyle=C.paper; g.font='600 11px Inter,system-ui,sans-serif'; g.textAlign='center';
      g.fillText('✓',cx,cy+4);
    } else if(nv>0){
      g.fillStyle=C.paper; g.font='600 10px Inter,system-ui,sans-serif'; g.textAlign='center';
      g.fillText(String(nv),cx,cy+3.5);
    }
  }
  if(freezeAt!=null){ draw(freezeAt); return; }
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){ draw(idle?T.wake+600:T.end+1); return; }
  /* Idle mode: the phase is frozen at "everyone awake, nobody has spoken yet" while orbital time advances alone at
     a constant rate and never reverses.
     It used to bounce the whole timeline back and forth between two points (0 -> 1 -> 0), so nodes rotated a little
     and then rotated backwards -- real orbits do not move like that, and it reads as fake instantly.
     IDLE_RATE drops the angular velocity to 0.4: standing by is background, and it should be slow enough to be barely perceptible. */
  if(idle){
    const IDLE_RATE=.4, settled=T.voteStart-400;
    const t0=performance.now();
    (function loop(now){
      if(!alive())return;
      ORB_T=settled+(now-t0)*IDLE_RATE;
      draw(settled);
      requestAnimationFrame(loop);
    })(performance.now());
    return;
  }
  const t0=performance.now()+base;
  (function loop(now){
    if(!alive())return;
    const t=now-t0;
    draw(t);
    if(t<T.end) requestAnimationFrame(loop);
    else draw(T.end+1);
  })(performance.now());
}
export { consensusRing, consensusNet }
