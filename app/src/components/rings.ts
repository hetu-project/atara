/* 共识环与星座图，逐字取自 console.html 的 consensusRing / consensusNet。
   这两张图是右栏的视觉本体，用 canvas 逐帧画——重写一遍就不是同一个产品了，
   所以原样搬过来，只在外面包一层 React。 */
/* eslint-disable */
// @ts-nocheck
function consensusRing(canvas, agents, startDelay, stepMs, score, center){
  score=score||90;
  const DPR=Math.min(2,window.devicePixelRatio||1), CSS=220;
  canvas.width=CSS*DPR; canvas.height=CSS*DPR;
  const g=canvas.getContext('2d'); g.scale(DPR,DPR);
  const cx=CSS/2, cy=CSS/2, R1=76, R2=94;
  const N=agents.length, TICKS=126, GAP=2;                 /* 每扇区 18 根，扇区间空 2 根位 */
  const per=Math.floor(TICKS/N);
  const seed=i=>{const x=Math.sin(i*127.1+311.7)*43758.5;return x-Math.floor(x)};
  const css=getComputedStyle(document.documentElement);
  const C={ink:css.getPropertyValue('--ink').trim(), faint:css.getPropertyValue('--faint-2').trim(),
           acc:css.getPropertyValue('--accent').trim(), warn:css.getPropertyValue('--warn').trim(),
           hair:css.getPropertyValue('--line-strong').trim(), mute:css.getPropertyValue('--mute').trim()};
  const a0=-Math.PI/2;                                     /* 12 点起，顺时针 */
  const tickAngle=k=>a0 + (k/TICKS)*Math.PI*2;
  const sectorOf=k=>Math.min(N-1, Math.floor(k/per));
  const inGap=k=>(k%per)>=per-GAP && sectorOf(k)<N-1;      /* 扇区间留缝 */
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const total=N*stepMs;                                    /* 扫满一圈的时长 */

  /* 刻度不再是「亮/不亮」两态，而是带热度：
       glow —— 刚被扫描头扫过的余辉，往回衰减十几根，拖出彗尾
       burst —— 这一扇区的票刚落地时整扇区的绽放
     两个热度都只加长度、线宽和辉光，不改颜色——颜色是语义（通过/存疑），
     热度是时间，两件事不能混在一个通道里说。 */
  function tick(k,on,warn,glow,burst){
    const a=tickAngle(k), r=seed(k);
    const heat=Math.max(glow||0,burst||0);
    const len=13+r*9+heat*8;                               /* 声纹式长短差（固定 seed，不闪） */
    /* 画布半径只有 110：热度加长后的刻度要 clamp，不然画出边被平切一刀 */
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
  /* 中心底光：随投票进度加深的一圈弥散光。它不是装饰——
     「越查越亮」本身就是进度，看一眼亮度就知道跑到哪了 */
  function core(prog){
    if(prog<=0)return;
    const gr=g.createRadialGradient(cx,cy,0,cx,cy,R1+6);
    gr.addColorStop(0,C.acc); gr.addColorStop(1,'transparent');
    g.globalAlpha=.12*prog; g.fillStyle=gr;
    g.beginPath(); g.arc(cx,cy,R1+6,0,Math.PI*2); g.fill();
    g.globalAlpha=1;
  }
  function threshold(){                                    /* 共识门槛 6/7 票：实体三角标 + 短线 */
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
      /* 放行环：票没齐时中心只报进度，票齐了把测量值和它对的那个阈值一起落下 */
      g.font='600 '+(done?String(center.big).length>6?'20px':'28px':'26px')+' Inter,system-ui,sans-serif';
      g.fillStyle=C.ink;
      g.fillText(done?String(center.big):`${n}/${N}`, cx, cy);
      /* 圆心只有 152px，放得下一个大字加一行小字。
         结论那句下面的共识行和闸门清单已经说过，这里不重复 */
      g.font='500 10px Inter,system-ui,sans-serif'; g.fillStyle=done?C.mute:C.faint;
      g.fillText(done?center.line:`${n}/${N} checks in`, cx, cy+19);
      return;
    }
    /* 中心是结论本身：AI 评出的风险分，随投票逐步逼近；共识票数退居小字 */
    g.font='600 34px Inter,system-ui,sans-serif';
    g.fillStyle=C.ink;
    g.fillText(String(done?score:Math.round(score*n/N)), cx, cy);
    g.font='500 9.5px Inter,system-ui,sans-serif'; g.fillStyle=C.mute;
    g.fillText('Trust Gate · higher is safer', cx, cy+15);
    g.font='500 10px Inter,system-ui,sans-serif'; g.fillStyle=done?C.mute:C.faint;
    g.fillText(done?`✓ ${N}/${N} agree`:`${n}/${N} agents voted`, cx, cy+30);
  }
  function needle(a){
    /* 扫描头自己也要发光，否则彗尾最亮的地方反而是尾巴 */
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
  const TAIL=15, BURST=per*.55;                            /* 彗尾长度、绽放衰减跨度（单位：刻度） */
  function frame(prog,rip){                                /* prog: 0..1 扫描进度; rip: 涟漪 0..1 */
    g.clearRect(0,0,CSS,CSS);
    const litTo=prog*TICKS;
    core(prog);
    /* 亮着的刻度走加法混合：叠在一起才会真的越叠越亮，
       source-over 只会互相盖住，辉光就糊成一块死白 */
    for(let k=0;k<TICKS;k++){
      if(inGap(k))continue;
      const sec=sectorOf(k), on=k<litTo;
      /* 余辉：离扫描头越近越亮，往回十五根衰减到零。
         只在扫描进行中有——定格后还亮着，最后一扇区就永远「在加载」 */
      const glow=(on&&prog<1)?Math.max(0,1-(litTo-k)/TAIL):0;
      /* 绽放：这一扇区最后一根被扫过的那一刻，整扇区一起亮一下 */
      const since=litTo-(sec+1)*per;
      const burst=(on&&prog<1&&since>=0&&since<BURST)?1-since/BURST:0;
      const hot=on&&(glow>.02||burst>.02);
      if(hot)g.globalCompositeOperation='lighter';
      tick(k, on, agents[sec].v!=='Pass', glow, burst);   /* Pass=强调色，note/flag=warn 色 */
      if(hot)g.globalCompositeOperation='source-over';
    }
    threshold();
    const votes=Math.min(N, Math.floor(prog*N + 1e-6));
    if(prog>=1){ centre(N,true); if(rip>0&&rip<1) ripple(R2+14+rip*26, .5*(1-rip)); }
    else { centre(votes,false); needle(tickAngle(litTo)); }
  }
  /* 空态：画一帧「还没开始」的样子就收手，不起循环。
     startDelay 传 null 即可——只有 consensusRing 认这个约定 */
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
  /* 竖排之后这块占满父宽（原来减 250 是给并排的环让位）。下限 300，
     再窄轨道就贴到边上了 */
  /* 同一张画布要在「待命 / 开工」之间来回换，旧的 rAF 循环必须作废，
     否则两个循环同时往一张画布上画，帧会互相盖 */
  const gen=(canvas._gen=(canvas._gen||0)+1);
  const alive=()=>canvas.isConnected && canvas._gen===gen;
  const measure=()=>Math.max(300,Math.min(560,canvas.parentElement?.clientWidth||460));
  let W=measure();
  /* 高度可传。轨道倍率不按 H/292 那样等比缩——那样图会白白留一圈空。
     直接按「可用高度反推最外圈半径」：外圈直径 2×106×SC 加上标签留的 44，
     正好填满 H。默认（不传 H）保持原样，跑起来那张不受影响。 */
  const H=hOpt||292;
  const SC=hOpt ? Math.max(.6,Math.min(1.3,(H-44)/212)) : 1;
  const g=canvas.getContext('2d');
  const fit=()=>{
    canvas.style.width=W+'px'; canvas.style.height=H+'px';
    canvas.width=W*DPR; canvas.height=H*DPR;
    g.setTransform(1,0,0,1,0,0); g.scale(DPR,DPR);   /* 改 canvas.width 会重置变换 */
  };
  fit();
  const css=getComputedStyle(document.documentElement);
  const C={ink:css.getPropertyValue('--ink').trim(), mute:css.getPropertyValue('--mute').trim(),
           faint:css.getPropertyValue('--faint-2').trim(), acc:css.getPropertyValue('--accent').trim(),
           warn:css.getPropertyValue('--warn').trim(), hair:css.getPropertyValue('--line-strong').trim(),
           green:css.getPropertyValue('--green').trim(),
           paper:css.getPropertyValue('--paper').trim()};
  /* cx 跟着栏宽走：左栏折叠 / 展开会改右栏宽度，画布得重新量、重新画，
     否则停在旧宽度上——展开时比容器还宽就横向溢出了。
     不用 ResizeObserver：它和 rAF 一样绑在渲染生命周期上，标签页不合成时根本不触发。
     改由「改变栏宽的那个动作」直接调 refit——谁改的谁负责重画，确定性的。 */
  const N=agents.length; let cx=W/2; const cy=H/2;
  const reduceNet=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastT=0;
  /* 公转时间与相位时间分家：相位（谁醒了、连线长到哪、投没投票）要能定格，
     公转不能——一定格就得靠别的手段制造运动，折返就是这么来的。
     ORB_T 不为 null 时，节点位置只认它。 */
  let ORB_T=null;
  canvas._refit=()=>{
    const nw=measure(); if(nw===W)return;
    W=nw; cx=W/2; fit(); draw(lastT);   /* 改 canvas.width 会清空画布，必须补一帧 */
  };
  addEventListener('resize',()=>canvas._refit&&canvas._refit());
  /* 时间表：唤醒 → 交流 → 投票 → 锁定 */
  const T={wake:1400, talk:4600, voteStep, votes:N*voteStep};
  T.voteStart=T.talk;  T.lockAt=T.voteStart+T.votes;  T.end=T.lockAt+900;
  const rnd=i=>{const x=Math.sin(i*93.7+41.3)*43758.5;return x-Math.floor(x)};
  /* 三圈正圆轨道；节点带各自的公转角速度（内快外慢，其中一圈反向） */
  const ORB=[{r:44*SC,w:.00052},{r:76*SC,w:-.00034},{r:106*SC,w:.00022}];
  const RING_OF=[1,2,0,2,1,2,0];                    /* 分圈模式，节点少时取模复用 */
  const nodes=agents.map((a,i)=>{
    const o=ORB[RING_OF[i%RING_OF.length]];
    return {a, o, r:(8+rnd(i+2)*5)*Math.max(.72,SC),
      a0:rnd(i+11)*Math.PI*2,
      born:200+i*170};
  });
  const npos=(n,t)=>{const th=n.a0+n.o.w*t;
    return {x:cx+Math.cos(th)*n.o.r, y:cy+Math.sin(th)*n.o.r}};
  /* 连线：交流期逐条长出（一边转一边出现连接） */
  /* 边按实际节点数生成：一圈相邻 + 几条弦。
     写死 7 节点的索引在 5 个 agent 时会越界，异常会打断整个 draw——
     连线之后的节点和名字就再也画不出来了 */
  const ring=[...Array(N)].map((_,i)=>[i,(i+1)%N]);
  const chords=[];
  for(let i=0;i<N;i++){const j=(i+Math.floor(N/2))%N; if(i<j)chords.push([i,j]);}
  const edges=[...ring,...chords].map((e,k)=>({e, born:T.wake+k*380}));
  /* 交流脉冲：贯穿交流期与投票前半段 */
  const msgs=[];
  for(let k=0;k<34;k++){
    msgs.push({t0:T.wake+400+rnd(k+20)*(T.voteStart+T.votes*.5-T.wake-800),
      dur:520+rnd(k+30)*420, ei:Math.floor(rnd(k+40)*edges.length), flip:rnd(k+50)>.5});
  }
  const ease=x=>1-Math.pow(1-x,3);
  function draw(t){
    lastT=t;
    g.clearRect(0,0,W,H);
    /* 正圆虚线轨道 */
    g.setLineDash([2,4]); g.strokeStyle=C.hair; g.lineWidth=1; g.globalAlpha=.9;
    ORB.forEach(o=>{g.beginPath();g.arc(cx,cy,o.r,0,Math.PI*2);g.stroke()});
    g.setLineDash([]); g.globalAlpha=1;
    const done=t>=T.end;
    const tt=done?T.end:t;                          /* 终态后停止公转 */
    const OT=ORB_T!=null?ORB_T:Math.max(0,tt);
    const P=nodes.map(n=>npos(n,OT));
    /* 节点命中区暴露给点击层（CSS 像素坐标，与 offsetX/Y 同系） */
    canvas._hits=nodes.map((n,i)=>({i, x:P[i].x, y:P[i].y, r:n.r}));
    canvas._done=done;
    /* 待命时不画连线、不画脉冲、不画中心核——「候命」就是几个球在各自轨道上飘。
       等真开工，连线、票脉冲、中心核一起长出来，那个对比本身就是信息。 */
    /* 一条线的颜色 = 这条链路上两个 agent 对上没对上：
       都没表态→暗；一头表了→强调色；两头都通过→绿；任一头有异议→警示。
       颜色在这里是结论，不是装饰——扫一眼整张网就知道有没有人不同意。 */
    const edgeCol=(i,j)=>{
      const vi=tt>=T.voteStart+i*voteStep, vj=tt>=T.voteStart+j*voteStep;
      if(!vi&&!vj)return {c:C.hair,a:.45};
      if((vi&&agents[i].v!=='Pass')||(vj&&agents[j].v!=='Pass'))return {c:C.warn,a:.62};
      if(vi&&vj)return {c:C.green,a:.5};
      return {c:C.acc,a:.5};
    };
    if(!idle) edges.forEach(({e:[i,j],born})=>{
      if(tt<born)return;
      /* 「突然接通」：线从一端长到另一端，260ms 走完，末端带一个亮头。
         原来是整条线一起淡入——那是渐显，不是接上。 */
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
    /* 常驻数据流：每条连线上有一个光点匀速往返地跑。
       原来的 msgs 是离散事件（谁跟谁说了一句），这个是「链路活着」的底噪，
       两者叠加才像一张真的在传数据的网。 */
    if(!idle && !done && !reduceNet) {
      g.globalCompositeOperation='lighter';
      edges.forEach(({e:[i,j],born},k)=>{
        if(tt<born+260)return;
        const ph=((tt-born)/2600+k*.137)%1;
        const kk=ph<.5?ph*2:2-ph*2;                     /* 0→1→0 往返，端点处自然减速 */
        const ec=edgeCol(i,j);                          /* 光点跟线同色：它运的就是这条链路的结论 */
        const x=P[i].x+(P[j].x-P[i].x)*kk, y=P[i].y+(P[j].y-P[i].y)*kk;
        g.globalAlpha=.6; g.fillStyle=ec.c;
        g.shadowBlur=7; g.shadowColor=ec.c;
        g.beginPath(); g.arc(x,y,1.6,0,Math.PI*2); g.fill();
        /* 到站：信息抵达那一头时溅一圈。没有这一下，光点只是在滑，
           有了这一下，才读得出「送到了」。 */
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
    /* 交流脉冲 */
    if(!done && !idle) msgs.forEach(m=>{
      const mt=(t-m.t0)/m.dur; if(mt<0||mt>1)return;
      const ed=edges[m.ei]; if(t<ed.born+300)return;
      let [i,j]=ed.e; if(m.flip){const q=i;i=j;j=q}
      const k=ease(mt);
      g.fillStyle=C.ink;
      g.beginPath(); g.arc(P[i].x+(P[j].x-P[i].x)*k, P[i].y+(P[j].y-P[i].y)*k, 1.8, 0, 7); g.fill();
    });
    /* 票脉冲：出票后 480ms 内飞向中心 */
    nodes.forEach((n,i)=>{
      const vt=t-(T.voteStart+i*voteStep);
      if(!done&&vt>=0&&vt<=480){
        const k=ease(vt/480), x=P[i].x+(cx-P[i].x)*k, y=P[i].y+(cy-P[i].y)*k;
        g.strokeStyle=C.acc; g.globalAlpha=.45; g.lineWidth=1;
        g.beginPath(); g.moveTo(P[i].x,P[i].y); g.lineTo(x,y); g.stroke(); g.globalAlpha=1;
        g.fillStyle=C.acc; g.beginPath(); g.arc(x,y,2.4,0,7); g.fill();
      }
    });
    /* 锁定 flash */
    const ft=(t-T.lockAt)/520;
    if(ft>0&&ft<1){
      g.strokeStyle=C.acc; g.globalAlpha=.7*(1-ft); g.lineWidth=1.5;
      edges.forEach(({e:[i,j]})=>{g.beginPath();g.moveTo(P[i].x,P[i].y);g.lineTo(P[j].x,P[j].y);g.stroke()});
      g.globalAlpha=1;
    }
    /* 节点：实心圆（GLASS 式）。思考中=灰；出票=墨/白实心，note=warn；出票瞬间半径 pop */
    nodes.forEach((n,i)=>{
      if(tt<n.born)return;
      const bi=Math.min(1,(tt-n.born)/400);
      const vAt=T.voteStart+i*voteStep, voted=tt>=vAt, warn=n.a.v!=='Pass';
      let rr=n.r*bi;
      if(voted&&!done){const pk=(tt-vAt)/380; if(pk<1) rr*=1+.28*Math.sin(Math.min(1,pk)*Math.PI);}
      g.fillStyle=voted?(warn?C.warn:C.ink):C.faint;
      g.globalAlpha=voted?1:.9;
      /* 出票瞬间辉光最强，之后落到一层底光——「表过态」和「还在看」一眼分得开 */
      if(voted&&!reduceNet){
        const fresh=Math.max(0,1-(tt-vAt)/900);
        g.shadowBlur=7+fresh*16; g.shadowColor=warn?C.warn:C.acc;
      }
      g.beginPath(); g.arc(P[i].x,P[i].y,rr,0,Math.PI*2); g.fill();
      g.shadowBlur=0; g.globalAlpha=1;
      /* 名字随节点走；票落后名字下多一行 */
      g.font='600 9.5px Inter,system-ui,sans-serif';
      g.fillStyle=voted?C.ink:C.mute;
      /* 名字顺着「圆心 → 节点」的方向往外放，并去掉 Agent 后缀：
         窄栏里一律压在节点正下方 + 全名，七个标签会叠成一团 */
      const dx=P[i].x-cx, dy=P[i].y-cy, dl=Math.hypot(dx,dy)||1;
      const ox=dx/dl*(rr+9), oy=dy/dl*(rr+9);
      const txt=n.a.n.replace(/ Agent$/,'');
      let al = ox>6?'left' : ox<-6?'right' : 'center', lx=P[i].x+ox;
      /* 外圈节点朝外放会顶出画布——超边就把标签翻到节点内侧 */
      const tw=g.measureText(txt).width;
      if(al==='left'  && lx+tw>W-4){al='right'; lx=P[i].x-ox}
      if(al==='right' && lx-tw<4)  {al='left';  lx=P[i].x-ox}
      if(al==='center')lx=Math.min(W-tw/2-4,Math.max(tw/2+4,lx));
      g.textAlign=al;
      /* 纵向同样要夹：最顶最底的节点朝外放标签会探出画布被裁半截 */
      const ly=Math.min(H-4,Math.max(10,P[i].y+oy+(oy>0?9:0)));
      g.fillText(txt, lx, ly);
    });
    /* 中心共识核：实心，收一票长一格；锁定后描一圈 + ✓。待命时没有核 */
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
  /* 待命模式：相位定格在「都醒了、还没开始表态」，公转时间独自匀速向前，永不折返。
     原来是让整个时间轴在两点之间来回弹（0→1→0），节点转一段就倒着转回去——
     真实的轨道没有这种运动，一眼就假。
     IDLE_RATE 把角速度压到 0.4：候命是背景，慢到几乎察觉不出在动才对。 */
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
