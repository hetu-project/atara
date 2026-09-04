/* 七个 agent 的名单与档案，逐字取自 console.html。
   分数、结论、证据都在这里——右栏的 roster、共识环、agent 档案共用它。
   这是数据不是代码：改文案就改这里，别在组件里另写一份。 */
/* eslint-disable */
// @ts-nocheck
const RISK_AGENTS=[
 {n:'Identity Agent', sc:94,  d:'KYC records · liveness',          v:'Pass',
  m:'government ID, liveness and account age reconcile across records',
  ev:{pull:'KYC registry · 6 records', rec:6, srcN:4,
    srcs:[{n:'Government ID registry',d:'document verified · 09:12 UTC'},
          {n:'HK Companies Registry',d:'CR 2841996 · active · filed 2024-03'},
          {n:'Liveness session',d:'passed · 11 days ago'},
          {n:'Forged-document index',d:'0 hits'}],
    checks:[['Document authenticity','Genuine'],['Face ↔ ID match','92%'],
            ['UBO declared vs registry','2 of 2 match'],['Proof of address','Utility bill · 6 weeks old'],
            ['Name across all records','Consistent']],
    kv:[['Legal entity','Golden Gate Ltd · HK'],['Incorporated','Mar 2024 · 2.4 yrs'],
        ['Account age','2.1 years'],['Beneficial owners','2 declared'],['Documents on file','6']],
    raw:['entity        Golden Gate Ltd','registry_no   CR-2841996 (HK)',
         'status        ACTIVE · good standing','ubo[0]        L. Cheung  · 62%',
         'ubo[1]        M. Fong    · 38%','liveness      PASS score=0.94  2026-08-13',
         'id_match      0.92  (threshold 0.85)']}},
 {n:'Provenance Agent', sc:91,d:'On-chain fund tracing',           v:'Pass',
  m:'funds trace to a licensed-exchange withdrawal three hops back — no mixer or bridge exposure',
  ev:{pull:'on-chain trace · 4 hops · 3 chains', rec:47, srcN:3,
    srcs:[{n:'TRON full node',d:'blocks 71.2M–71.4M indexed'},
          {n:'Attribution set',d:'exchange + mixer + bridge labels · updated 06:00 UTC'},
          {n:'Sanctioned address list',d:'0 hits along the path'}],
    flow:[{n:'Binance · licensed exchange',d:'withdrawal 52,000 USDT · KYC’d venue',t:'3 hops back'},
          {n:'TQ5n…aU8k · treasury',d:'held 41 days · no outflow in between',t:'2 hops back'},
          {n:'TWr8…kP2m · OTC desk',d:'labelled desk wallet · 890 prior transfers',t:'1 hop back'},
          {n:'Settlement wallet',d:'funds this order · 18,826 USDC',t:'now'}],
    checks:[['Mixer exposure','0% · none in 5 hops'],['Bridge exposure','0%'],
            ['Peel-chain pattern','Not detected'],['Sanctioned address touch','None'],
            ['Dormancy before send','41 days — normal for a desk']],
    kv:[['Hops traced','4 of max 5'],['Origin','Centralised exchange'],
        ['Tainted share','0.0%'],['Oldest funds','2026-05-14']],
    raw:['tx  a41f…9cd2  −52,000 USDT  Binance_hot_04 → TQ5n…aU8k',
         'tx  7be0…1a55       held 41d  no outbound',
         'tx  c93d…44e1  −18,826 USDC  TQ5n…aU8k → TWr8…kP2m',
         'tx  0f21…8b70  −18,826 USDC  TWr8…kP2m → escrow',
         'labels  binance:hot, otc_desk:verified   flags: none']}},
 {n:'Graph Agent', sc:88,     d:'Address clustering · related parties', v:'Pass',
  m:'address cluster is isolated, no shared infrastructure with flagged accounts',
  ev:{pull:'cluster scan · 214 addresses', rec:214, srcN:2,
    srcs:[{n:'Co-spend clustering engine',d:'214 addresses resolved to 1 entity'},
          {n:'Flagged-entity graph',d:'2-hop neighbourhood · 1,806 edges checked'}],
    checks:[['Shared infrastructure with flagged','0'],['Distance to nearest flagged entity','4 hops'],
            ['Common counterparties with you','3 · all previously settled'],
            ['Sybil / self-dealing pattern','Not detected'],['Cluster age','2.0 years']],
    kv:[['Cluster size','214 addresses'],['Direct counterparties','188'],
        ['Flagged neighbours (1 hop)','0'],['Flagged neighbours (2 hops)','0'],
        ['Shared with your history','3 counterparties']],
    raw:['cluster_id    gg-0x41c2  (214 addr, 2.0y)',
         'edges_scanned 1,806   depth=2',
         'flagged_hits  0       nearest=4 hops (mixer:tornado)',
         'shared_cp     hc-shenzhen, kj-osaka, pb-manila',
         'sybil_score   0.03   (threshold 0.40)']}},
 {n:'Sanctions Agent', sc:97, d:'Watchlists · PEP screening',      v:'Pass',
  m:'no hits across OFAC, UN or EU lists; jurisdiction clear',
  ev:{pull:'5 watchlists · 2 entities screened', rec:10, srcN:5,
    srcs:[{n:'OFAC SDN + consolidated',d:'0 hits · list of 2026-08-22'},
          {n:'UN consolidated',d:'0 hits · 09:12 UTC'},
          {n:'EU financial sanctions',d:'0 hits · 09:12 UTC'},
          {n:'UK HMT',d:'0 hits · 09:12 UTC'},
          {n:'PEP & adverse-media index',d:'0 matches above threshold'}],
    checks:[['Legal name','No match'],['Known aliases (3)','No match'],
            ['Beneficial owners (2)','No match'],['Registered address','No match'],
            ['Fuzzy threshold','0.85 · best score 0.31']],
    kv:[['Entities screened','2 · company + 2 UBOs'],['Lists queried','5'],
        ['Highest match score','0.31 of 1.00'],['Jurisdiction','Hong Kong — not restricted'],
        ['Screening age','4 minutes']],
    raw:['query   "Golden Gate Ltd" + 3 aliases + 2 UBO names',
         'ofac    0 hits   best=0.31 "Golden Bridge Ltd" (RU) — rejected',
         'un      0 hits   eu 0 hits   hmt 0 hits',
         'pep     0 matches  adverse_media 0 above 0.60',
         'jurisdiction  HK  restricted=false']}},
 {n:'Behavior Agent', sc:86,  d:'Settlement history · disputes',   v:'Pass',
  m:'deep settlement history, zero disputes, median release under two minutes',
  ev:{pull:'settlement ledger · 124 trades', rec:124, srcN:2,
    srcs:[{n:'Platform settlement ledger',d:'124 completed trades · 18 months'},
          {n:'Dispute & chargeback log',d:'0 records'}],
    checks:[['Completion rate','100% · 124 of 124'],['Disputes filed','0'],
            ['Late releases','2 · both under 10 min'],['Cancelled after match','1 · buyer-side'],
            ['Behaviour drift vs own baseline','None']],
    kv:[['Completed trades','124'],['Volume settled','$1.42M'],
        ['Median release','1m 48s'],['Slowest release','9m 12s'],
        ['Repeat counterparties','61%'],['Trades with you','3']],
    raw:['trades       124   volume $1,418,300   window 18mo',
         'release_p50  108s  p90 262s  max 552s',
         'disputes     0     chargebacks 0',
         'cancels      1     (2026-04-02, buyer withdrew)',
         'with_you     3     last 2026-07-29  all released']}},
 {n:'Pricing Agent', sc:90,   d:'Quote deviation vs index',        v:'Pass',
  m:'quote sits +0.5% over index — inside the normal band, no bait-pricing pattern',
  ev:{pull:'index feed · 5 venues', rec:5, srcN:5,
    srcs:[{n:'Venue mid prices',d:'5 venues · 30s snapshot'},
          {n:'Their 30-day quote history',d:'41 quotes'},
          {n:'Peer quotes on this pair',d:'12 live offers'},
          {n:'Spread benchmark',d:'rolling 7-day band'},
          {n:'Post-match repricing log',d:'0 events'}],
    checks:[['Deviation vs index','+0.5% · band ±1.2%'],['Bait-and-switch history','None in 41 quotes'],
            ['Repricing after match','Never'],['Rank among 12 peers','3rd best'],
            ['Spread vs their own median','−0.1pp']],
    kv:[['This quote','7.32'],['Index mid (5 venues)','7.28'],
        ['Deviation','+0.5%'],['Their 30-day median spread','0.6%'],
        ['Best peer quote','7.30'],['Slippage risk','Low']],
    raw:['quote     7.32 CNY/USDC   size 8,682',
         'index     7.2810  (binance 7.281 okx 7.280 bybit 7.283 …)',
         'dev       +0.50%   band ±1.20%   z=0.41',
         'hist_30d  41 quotes  median_spread 0.60%  reprice_events 0',
         'peers     12 live   best 7.30   worst 7.44']}},
 {n:'Velocity Agent', sc:74,  d:'Frequency & size anomaly',        v:'Pass · note',
  rz:'this is the largest ticket with this counterparty in 30 days. It is within your limit, so it is recorded on the order — not blocking',
  ev:{pull:'30-day pattern · 41 transfers', rec:41, srcN:2,
    srcs:[{n:'Your transfer log',d:'41 transfers · 30 days'},
          {n:'90-day baseline',d:'118 transfers · median $5,900'}],
    checks:[['Ticket vs 30-day max','2.0× — above pattern'],['Ticket vs your limit','75% of $25,000 — inside'],
            ['Transfers today','1 · normal'],['Structuring pattern','Not detected'],
            ['Counterparty concentration','18% of 30-day volume']],
    kv:[['This ticket','$18,826'],['30-day median','$6,200'],
        ['30-day max before this','$9,400'],['90-day max','$14,100'],
        ['Your per-deal limit','$25,000'],['Transfers in 30 days','41']],
    raw:['ticket      $18,826   pctile 99 (30d)  z=2.31',
         'p50_30d     $6,200    max_30d $9,400',
         'p50_90d     $5,900    max_90d $14,100',
         'limit       $25,000   utilisation 75%',
         'structuring none  (no split pattern in 7d)',
         'verdict     PASS + NOTE  recorded_on_order=true']}},
];

function agentGlyph(i){
  const star=(pn,r1,r2)=>{let d='';for(let k=0;k<pn*2;k++){
    const r=k%2?r2:r1, a=Math.PI*k/pn-Math.PI/2;
    d+=(k?'L':'M')+(14+r*Math.cos(a)).toFixed(1)+' '+(14+r*Math.sin(a)).toFixed(1)}
    return d+'Z'};
  const G=[
   /* Identity —— 蓝圆脸：最基础的一张脸，身份就是「你是谁」 */
   {c:'#5B7CFA', body:`<circle cx="14" cy="14" r="11.6"/>`},
   /* Provenance —— 绿 blob：链上流过来的一摊，形状不规则 */
   {c:'#3E9B6C', body:`<path d="M14 2.9c4.6-.5 9.3 2.2 10.4 6.6 1 4.1-.4 8.7-3.4 11.5-3 2.8-8 3.7-11.9 2-3.8-1.7-6.3-5.8-5.9-10C3.6 8.7 6.6 4.8 10.3 3.5c1.2-.4 2.5-.5 3.7-.6Z"/>`},
   /* Graph —— 蓝四叶：四个节点抱成一团 */
   {c:'#4F86E8', body:`<circle cx="9.2" cy="9.2" r="6.4"/><circle cx="18.8" cy="9.2" r="6.4"/>
     <circle cx="9.2" cy="18.8" r="6.4"/><circle cx="18.8" cy="18.8" r="6.4"/>
     <rect x="8" y="8" width="12" height="12"/>`},
   /* Sanctions —— 橙圆角三角：路边的警示牌 */
   {c:'#E8833A', body:`<path d="M12 3.6c1-1.6 3-1.6 4 0l8.6 15.4c1 1.7-.2 3.9-2 3.9H5.4c-1.8 0-3-2.2-2-3.9Z"/>`, ey:16.5},
   /* Behavior —— 粉花：五瓣，性格外放 */
   {c:'#E993B9', body:`<circle cx="14" cy="6.6" r="5"/><circle cx="21" cy="11.7" r="5"/>
     <circle cx="18.3" cy="19.9" r="5"/><circle cx="9.7" cy="19.9" r="5"/>
     <circle cx="7" cy="11.7" r="5"/><circle cx="14" cy="13.5" r="6.2"/>`},
   /* Pricing —— 黄太阳：十二芒星，市场的光 */
   {c:'#EFBE3F', body:`<path d="${star(12,12.3,8.9)}"/>`},
   /* Velocity —— 白幽灵：速度与异动，飘的 */
   {c:'#E8E5DF', body:`<path d="M5.4 13.2C5.4 7.9 9.2 4 14 4s8.6 3.9 8.6 9.2v8.2c0 1.1-1.2 1.7-2 1l-1.5-1.3-2 1.8c-.6.5-1.5.5-2.1 0L14 22l-1 .9c-.6.5-1.5.5-2.1 0l-2-1.8-1.5 1.3c-.8.7-2 .1-2-1Z"/>`, ec:'#4a4a52'},
  ][i%7];
  const ey=G.ey||13.4, ec=G.ec||'#1e2026';
  return `<svg viewBox="0 0 28 28" aria-hidden="true">
    <g class="gart">
      <g fill="${G.c}">${G.body}</g>
      <g class="geyes" fill="${ec}">
        <rect x="10.4" y="${ey-2.6}" width="2.5" height="5.6" rx="1.25"/>
        <rect x="15.1" y="${ey-2.6}" width="2.5" height="5.6" rx="1.25"/>
      </g>
    </g>
  </svg>`;
}
export { RISK_AGENTS, agentGlyph }
