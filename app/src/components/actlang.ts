/* Data and parser for the action bar, taken verbatim from console.html.
 *
 * liveParse is the "fill in the sentence as you type" step: split a sentence into slots, solid for
 * what was said, filled in by reasonable guess and dashed for what was not. It is a pure function,
 * depending only on the contact list passed in.
 */
/* eslint-disable */
// @ts-nocheck
const DATA_METRICS={
 'Ad platform API':      ['Clicks','Conversions','Impressions'],
 'Logistics API':        ['Delivered','Signed for','Out for delivery'],
 'Payment gateway API':  ['Payment settled','Chargeback rate'],
 'On-chain oracle':      ['Transfer confirmed','Balance'],
};

const ATOMS={
 approve:{n:'Approval', defs:{who:'Both sides confirm'},
   params:[{type:'pick', k:'who', opts:()=>['Both sides confirm','I confirm']}],
   txt:p=>p.who||'Both sides confirm'},
 evidence:{n:'Evidence', defs:{proof:'Bank receipt'},
   params:[{type:'pick', k:'proof', opts:()=>['Bank receipt','Delivery record','Work delivered']}],
   txt:p=>`${p.proof} uploaded`},
 data:{n:'API data', defs:{src:'Ad platform API', metric:'Clicks', target:'≥ 1,000'},
   params:[
     {type:'pick', k:'src',    opts:()=>Object.keys(DATA_METRICS)},
     {type:'pick', k:'metric', opts:p=>DATA_METRICS[p.src]||[]},
     {type:'text', k:'target', ph:'target — e.g. ≥ 1,000', w:120}],
   txt:p=>`${p.src} · ${p.metric} ${p.target||''}`.trim()},
 time:{n:'Time', defs:{date:'Sep 1', dateISO:'2026-09-01'},
   params:[{type:'date', k:'date'}],
   txt:p=>`On ${p.date}`},
};

const MAX_CONDS=3;
function compileConds(conds,timeout){
  if(!conds||!conds.length) return {main:'Immediately', text:'immediately', p:{}};
  const text=conds.map(c=>ATOMS[c.t].txt(c.p)).join(' + ');
  const has=t=>conds.find(c=>c.t===t);
  const main = has('approve') ? 'When I confirm'
             : has('evidence') ? 'Proof + window' : 'On a date';
  const p={};
  if(has('evidence')){p.proof=has('evidence').p.proof; p.win='3 days'}
  if(has('time')) p.date=has('time').p.date;
  else if(has('data')) p.date='the data target';
  if(has('approve')) p.within=timeout;
  /* main is the four top-level branches used by the escrow state machine; kind is "what it is actually
     waiting for", used for the track station names and the copy -- API data compiles to On a date, but what it waits for is a metric, not a date */
  const kind = has('approve') ? 'approve' : has('evidence') ? 'evidence'
             : has('data') ? 'data' : has('time') ? 'time' : 'now';
  /* The timeout fallback is not part of the "release condition" -- it is what happens when the condition
     does not hold, and mixing the two into one sentence is both unreadable and never something a user picked in the editor */
  return {main, kind, text, fallback:timeout, p};
}

const ACT_DEF={
  /* The amount slot takes digits only (a coin quantity) -- currency symbols do not go in the amount slot, the fiat paid lives in the with slot */
  buy: {verb:'buy',      unit:'coin', mid:'with'},
  sell:{verb:'sell',     unit:'coin', mid:'for'},
  /* Transfer and Conditional order are two settings of the same verb (When empty / non-empty), so only
     one entry point is kept: Conditional order, verb transfer, When defaulting to Immediately.
     Buy/Sell conditions are fixed by the protocol (receipt + confirmation window) and do not enter this slot. */
  cond:{verb:'transfer', unit:'coin', mid:'to'},
};

function liveParse(q, CPS){
  const ql=q.toLowerCase();
  const k = /\b(buy|purchase)|买/.test(ql)?'buy'
          : /\bsell\b|卖|出\s*u/.test(ql)?'sell'
          : /\b(transfer|send|pay)\b|转|付/.test(ql)?'cond' : null;
  if(!k) return null;
  const r={k, src:{}};
  /* "100 usdt" = 100 coins, not a budget of 100 yuan -- a number directly followed by a currency parses as a quantity */
  /* "u" is the colloquial alias for USDT -- "200 u" is 200 coins, not 200 yuan */
  const amc=q.match(/(\d[\d,]*(?:\.\d+)?)\s*(usdt|usdc|btc|eth|u)\b/i);
  const am=q.match(/(?:\$|¥)?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|K|m|M|万)?/);
  if(amc){r.amt=parseFloat(amc[1].replace(/,/g,'')); r.amtCoin=true; r.src.amt=1;
    r.coin=amc[2].toLowerCase()==='u'?'USDT':amc[2].toUpperCase(); r.src.coin=1}
  if(k==='buy'||k==='sell')r.amtCoin=true;   /* buy/sell quantities are always in coins */
  else if(am){let v=parseFloat(am[1].replace(/,/g,'')); const u=(am[2]||'').toLowerCase();
    if(am[2]==='万')v*=1e4; else if(u==='k')v*=1e3; else if(u==='m')v*=1e6;
    if(v>0){r.amt=Math.round(v); r.src.amt=1}}
  const co=ql.match(/\b(usdt|usdc|btc|eth)\b/); if(co&&!r.coin){r.coin=co[1].toUpperCase(); r.src.coin=1}
  const FMAP={rmb:'CNY',cny:'CNY',hkd:'HKD',sgd:'SGD',jpy:'JPY',eur:'EUR',aed:'AED',gbp:'GBP',usd:'USD'};
  /* The currency after with/for = the fiat paid ("with rmb"); a bare currency word ranks below it */
  const fiA=ql.match(/(?:with|for|in|用)\s+(rmb|cny|hkd|sgd|jpy|eur|aed|gbp|usd|人民币)/);
  const fiB=ql.match(/\b(rmb|cny|hkd|sgd|jpy|eur|aed|gbp|usd)\b/);
  const fitok=fiA?fiA[1]:(fiB?fiB[1]:null);
  if(fitok){r.fiat=FMAP[fitok==='人民币'?'rmb':fitok]; r.src.fiat=1}
  const cp=CPS.find(c=>ql.includes(c.name.toLowerCase())||ql.includes(c.name.split(' ')[0].toLowerCase()));
  if(cp){r.peer=cp.name; r.src.peer=1}
  /* Conditions compose: one sentence can hit several atoms at once ("both sides confirm and by the 1st") */
  r.conds=[];
  if(/receipt|回执/.test(ql)) r.conds.push({t:'evidence',p:{proof:'Bank receipt'}});
  else if(/on\s*deliver|delivered|proof|发货|收货|凭证/.test(ql)) r.conds.push({t:'evidence',p:{proof:'Delivery record'}});
  if(/双方|both|approv|confirm|验收|确认/.test(ql)) r.conds.push({t:'approve',p:{who:'Both sides confirm'}});
  if(/on\s*the\s*(\d+)|monthly|每月|日放/.test(ql)){
    const dm=ql.match(/on\s*the\s*(\d+)/);
    r.conds.push({t:'time',p:{date:dm?('the '+dm[1]+(dm[1]==='1'?'st':dm[1]==='2'?'nd':dm[1]==='3'?'rd':'th')):'the 1st'}});
  }
  if(/immediat|right\s*now|立即/.test(ql)) r.conds=[];
  if(r.conds.length||/immediat|立即/.test(ql))r.src.cond=1;
  const fy=q.match(/\bfor\s+([^,.;]+?)\s*$/i);
  if(fy && !/^(usdt|usdc|btc|eth|cny|hkd|sgd|jpy|eur|aed|gbp|usd)$/i.test(fy[1].trim())){
    r.why=fy[1].trim().replace(/^./,c=>c.toUpperCase()); r.src.why=1;
  }
  return r;
}

const INTENTS=['Supplier balance','Delivery acceptance','Rent','Payroll',
               'Service subscription','API usage'];
export { DATA_METRICS, ATOMS, MAX_CONDS, ACT_DEF, liveParse, INTENTS }
