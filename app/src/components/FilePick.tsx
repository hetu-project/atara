import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useToast } from './Toast'

/**
 * 选一个文件并上传，带进度、预览和重传。
 *
 * 替掉项目里三处裸的 `<input type="file">`（付款回执、异议证据、准入材料）。
 * 那三处的共同毛病：点完按钮到成功之间界面完全不动——传一张几 MB 的照片
 * 要好几秒，那几秒里人不知道是在传、还是点漏了。其中准入那处的 catch
 * 甚至是空的，传失败了界面上一个字都不说。
 *
 * 上传本身是「选完就传」，不等提交表单：等提交再传的话，人填完点保存，
 * 又得盯着一个不知道多久的等待；而且那时才发现文件太大，已经填完一整页了。
 */

type State =
  | { s: 'idle' }
  | { s: 'up'; name: string; pct: number }
  | { s: 'ok'; name: string; ref: string }
  | { s: 'bad'; name: string; why: string }

export default function FilePick({
  onDone,
  value,
  label = 'Attach',
  hint,
  accept = 'image/*,application/pdf',
  identity,
  className = '',
  variant = 'field',
  disabled = false,
}: {
  /** 上传成功后拿到的 file_ref。 */
  onDone: (ref: string) => void
  /** 已经传过的那一份（回填用）。给了就直接显示成已附。 */
  value?: string
  label?: string
  /** 没选文件时那行小字，说明该传什么。 */
  hint?: string
  accept?: string
  identity?: string
  className?: string
  /**
   * 'field'：表单里的虚线框（准入材料、异议证据）。
   * 'button'：页脚的一颗主按钮（付款回执）——那一处是个一次性动作，
   *   不是一个要一直显示着的字段，摆一个虚线框会把页脚整行撑开。
   */
  variant?: 'field' | 'button'
  /** button 形态下禁用（比如外面正在提交别的东西）。 */
  disabled?: boolean
}) {
  const [st, setSt] = useState<State>(value ? { s: 'ok', name: short(value), ref: value } : { s: 'idle' })
  const pick = useRef<HTMLInputElement>(null)
  const job = useRef<{ abort: () => void } | null>(null)
  const last = useRef<File | null>(null)
  const { toast } = useToast()

  /* 离开时掐掉还在传的那个。不掐的话它会传完、然后在一个已经不存在的
     组件上调 setState，而那份文件根本没人要了。 */
  useEffect(() => () => job.current?.abort(), [])

  const send = (f: File) => {
    /* 先在本地拦大小。后端那边是 io.LimitReader 静默截断——超了不报错，
       而是存下一个被砍掉一半的文件。等到审核员打不开才发现就太晚了。 */
    if (f.size > ep.MAX_UPLOAD) {
      const why = `That file is ${mb(f.size)}, over the ${mb(ep.MAX_UPLOAD)} limit`
      setSt({ s: 'bad', name: f.name, why })
      toast(why, { kind: 'err' })
      return
    }
    last.current = f
    setSt({ s: 'up', name: f.name, pct: 0 })
    const j = ep.uploadProgress(f, pct => setSt(s => (s.s === 'up' ? { ...s, pct } : s)), identity)
    job.current = j
    j.done.then(u => {
      job.current = null
      setSt({ s: 'ok', name: f.name, ref: u.file_ref })
      onDone(u.file_ref)
    }).catch((e: unknown) => {
      job.current = null
      const msg = e instanceof Error ? e.message : 'Upload failed'
      /* 自己取消的不算失败：退回未选状态，不留一条红字。 */
      if (msg === 'Upload cancelled') { setSt({ s: 'idle' }); return }
      setSt({ s: 'bad', name: f.name, why: msg })
      toast(msg, { kind: 'err', action: { label: 'Retry', onClick: () => send(f) } })
    })
  }

  const input = (
    <input type="file" hidden ref={pick} accept={accept}
      onChange={e => {
        const f = e.target.files?.[0]
        /* 值要清掉：不清的话连着选同一个文件不会触发 change，
           上传失败后想重选同一份就点不动了。 */
        e.target.value = ''
        if (f) send(f)
      }} />
  )

  /* 按钮形态：进度画在按钮自己身上（--pct 驱动一层底色），页脚那一行
     容不下一条独立的进度条。传的时候点它就是取消。 */
  if (variant === 'button') {
    const up = st.s === 'up'
    return (
      <>
        {input}
        <button type="button" disabled={disabled && !up}
          className={'btn btn-primary fpbtn1' + (up ? ' uping' : '')}
          style={up ? ({ ['--pct' as string]: st.pct + '%' } as React.CSSProperties) : undefined}
          onClick={() => { if (up) { job.current?.abort(); return } pick.current?.click() }}>
          {up ? `${st.pct}% · Cancel` : label}
        </button>
      </>
    )
  }

  return (
    <div className={'fpick ' + className}>
      {input}
      <button type="button" className={'sfup fpbtn' + (st.s === 'ok' ? ' ok' : st.s === 'bad' ? ' bad' : '')}
        onClick={() => {
          if (st.s === 'up') { job.current?.abort(); return }
          pick.current?.click()
        }}>
        <span className="fptx">
          <b>{label}</b>
          <em>{st.s === 'idle' ? (hint ?? 'Image or PDF, up to ' + mb(ep.MAX_UPLOAD))
            : st.s === 'bad' ? st.why : st.name}</em>
        </span>
        <span className="sfst">
          {st.s === 'up' ? `${st.pct}% · Cancel`
            : st.s === 'ok' ? 'Attached'
              : st.s === 'bad' ? 'Try again' : 'Choose'}
        </span>
      </button>

      {/* 进度条只在传的时候占位。常驻一条空槽会让静止的表单看起来像在等什么。 */}
      {st.s === 'up' && (
        <div className="fpbar" role="progressbar" aria-valuenow={st.pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: st.pct + '%' }} />
        </div>
      )}

      {/* 传上去的东西要能点开看。显示一句「已上传」等于让人相信一份他看不到的
          文件——这条在别处（证据包）已经是既定做法，这里保持一致。 */}
      {st.s === 'ok' && (
        <a className="fplink" href={ep.fileURL(st.ref)} target="_blank" rel="noopener">View file</a>
      )}
    </div>
  )
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(n > 10 * 1024 * 1024 ? 0 : 1) + ' MB'
/** 回填时只有 ref，没有原始文件名——取末段当名字，好过显示一长串 uuid。 */
const short = (ref: string) => ref.split('/').pop() ?? ref
