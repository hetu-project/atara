import { useState } from 'react'
import type { OrderAssessment } from '../api/types'

/**
 * 下单前那次风控评估，落在对话里的那张卡。
 *
 * 结构逐处对着参照的 consensusThenDeal()：一行「读了什么、几票、过没过」的
 * 清单，一张可展开的 Trust Gate 卡，卡上四行摘要。
 *
 * 数据全部来自工单接口里的 assessment 快照——包括「读了 23 个来源 447 条
 * 记录」那一行。那句话是在向用户交代凭什么放行，前端编一个好看的数就是
 * 拿假话去支撑一个判断，所以后端不给就不显示。
 */

/* 摘要那四行取自四个特定的 agent。参照挑的是 Identity / Provenance /
   Sanctions / Pricing，我们这边对应的是下面这四个——名字不同，问的是同一
   件事。取不到就不显示那一行，不拿别的凑数。 */
const SUMMARY: [string, string][] = [
  ['Counterparty', 'Counterparty history'],
  ['Funds', 'Source of funds'],
  ['Compliance', 'Sanctions screening'],
  ['Market', 'Velocity check'],
]

export default function AssessCard({ a, peer }: { a: OrderAssessment; peer?: string }) {
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState(true)
  const notes = a.votes.filter(v => v.verdict !== 'pass')
  const cleared = a.votes.length - notes.length
  const ok = a.passed >= a.threshold

  /* 标题里的秒数只在真的跑过一秒以上时才印。
     参照那边的「Assessed in 13s」是动画自己跑掉的时间；我们这边评估是
     算出来的，后端量了多久就是多久。编一个像样的秒数，等于拿一句假话
     去撑「我们认真查过」这个印象。 */
  const secs = a.took_ms && a.took_ms >= 1000 ? Math.round(a.took_ms / 1000) : 0

  /* 四行，逐处对着参照的 arunStep 措辞。第一行是「读了这一单」——
     它交代的是评估的对象，没有它，下面三行的数字悬在半空。 */
  const rows = [
    peer ? `Read the order · ${peer}` : 'Read the order',
    a.sources > 0 ? `Read ${a.sources} sources · ${a.records.toLocaleString()} records` : '',
    `${cleared} of ${a.total} cleared${notes.length ? ` · ${notes.length} with a note` : ''}`,
    `${a.passed}/${a.total} agree · needs ${a.threshold} of ${a.total} — ${ok ? 'approved' : 'held'}`,
  ].filter(Boolean)

  const summary = SUMMARY
    .map(([label, agent]) => [label, a.votes.find(v => v.agent === agent)?.note] as const)
    .filter((x): x is readonly [string, string] => !!x[1])

  return (
    <>
      {/* 跑完之后那份痕迹，结构与 Thinking.tsx 同一套 .thk。
      
          差别在数据来源：Thinking 挂在这一次运行的临时状态上，刷新就没了；
          这里从工单存下来的 assessment 快照渲染，所以下次进这个会话，
          当时评了什么、凭什么放行，还在原地。参照那边跑的时候是逐条点亮的
          动画，这里是事后回看——评估在下单那一刻就跑完了，再演一遍进度条
          是假的，所以每一行直接是 done。 */}
      <div className={'thk' + (steps ? ' open' : '')}>
        <button className="thkh" type="button" aria-expanded={steps}
          onClick={() => setSteps(v => !v)}>
          <span className="thksp" aria-hidden>✦</span>
          <span className="thkl">{secs ? `Assessed in ${secs}s` : 'Assessed'}</span>
          <span className="thkc" aria-hidden>⌄</span>
        </button>
        <div className="thkb"><div className="thkin">
          <span className="thkline" aria-hidden />
          <div className="thkrows">
            {rows.map((text, i) => (
              <div key={text} className="thkr done" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="thkri" aria-hidden />
                <span className="thkrt">{text}</span>
              </div>
            ))}
          </div>
        </div></div>
      </div>

      <div className="msg sys">
        <div className={'asscard' + (open ? ' open' : '')}>
          <button className="aschead" type="button" aria-expanded={open}
            onClick={() => setOpen(v => !v)}>
            <span className="ascsc num">{a.score}</span>
            <div className="ascm">
              <b>Trust Gate {a.score} · {a.passed}/{a.total} agree —{' '}
                {ok ? 'clear to proceed' : 'held for review'}</b>
              <span>{notes.length
                ? `${notes.length} note${notes.length > 1 ? 's' : ''} · ${
                  notes.map(v => v.agent).join(', ')} — recorded on the order, not blocking`
                : `All ${a.total} clean — nothing recorded`}</span>
            </div>
            <span className="ascx" aria-hidden>⌄</span>
          </button>
          {!open && (
            <div className="ascsum">
              {summary.map(([k, v]) => (
                <div className="ascr" key={k}><i /><span>{k}</span><em>{v}</em></div>
              ))}
            </div>
          )}
          {open && (
            <div className="ascbody">
              {/* 展开是全部七票，不是四行摘要的加长版——收起看结论，
                  展开看每一个 agent 各自说了什么。 */}
              <ul>
                {a.votes.map(v => (
                  <li key={v.agent} className={v.verdict === 'pass' ? '' : 'bnote'}>
                    <b>{v.agent}</b> — {v.note}
                  </li>
                ))}
              </ul>
              <b>Verdict:</b> {a.passed}/{a.total} agents approve (needs {a.threshold} of {a.total}).
              {notes.length
                ? ' The note rides with the order record and does not block release.'
                : ''}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
