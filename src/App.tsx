import { useCallback, useEffect, useState } from 'react'
import {
  fetchFileInfo,
  findArticleImageChange,
  parseWikiInput,
  type ImageMeta,
} from './api'
import { CompareSlider } from './CompareSlider'
import { exportComparisonPng } from './exportImage'

interface Side {
  src: string
  fullUrl: string
  label: string
  uploadDate: string
  meta: ImageMeta
}

interface Result {
  heading: string
  before: Side
  after: Side
}

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'result'; result: Result }

function readHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''))
}

function fmtDate(iso: string): string {
  return iso.slice(0, 10)
}

async function loadFromParams(params: URLSearchParams): Promise<Result | null> {
  const wiki = params.get('wiki')
  const a = params.get('a')
  const b = params.get('b')

  if (wiki) {
    const parsed = parseWikiInput(wiki)

    if (!parsed.isFile) {
      // Article: walk revision history to find the last lead-image *swap*.
      const change = await findArticleImageChange(parsed.host, parsed.title)
      if (!change) {
        throw new Error(
          `Couldn't find a lead image change in the recent history of "${parsed.title}". ` +
            'Try the two-files mode instead.',
        )
      }
      const [prevMeta, currMeta] = await Promise.all([
        fetchFileInfo(parsed.host, change.previousFile, 1),
        fetchFileInfo(parsed.host, change.currentFile, 1),
      ])
      return {
        heading: `${parsed.title} — lead image change`,
        before: {
          src: prevMeta.versions[0].thumbUrl,
          fullUrl: prevMeta.versions[0].url,
          label: `Before · until ${fmtDate(change.previousUntil)}`,
          uploadDate: fmtDate(prevMeta.versions[0].timestamp),
          meta: prevMeta,
        },
        after: {
          src: currMeta.versions[0].thumbUrl,
          fullUrl: currMeta.versions[0].url,
          label: `After · since ${fmtDate(change.changedAt)}`,
          uploadDate: fmtDate(currMeta.versions[0].timestamp),
          meta: currMeta,
        },
      }
    }

    // Commons file: compare the two latest uploaded versions of the file.
    const meta = await fetchFileInfo(parsed.host, parsed.title, 2)
    if (meta.versions.length < 2) {
      throw new Error(
        `"${meta.fileTitle}" only has one uploaded version — nothing to compare. ` +
          'Try the two-files mode instead.',
      )
    }
    const [after, before] = meta.versions
    return {
      heading: meta.fileTitle,
      before: {
        src: before.thumbUrl,
        fullUrl: before.url,
        label: 'Before',
        uploadDate: fmtDate(before.timestamp),
        meta,
      },
      after: {
        src: after.thumbUrl,
        fullUrl: after.url,
        label: 'After',
        uploadDate: fmtDate(after.timestamp),
        meta,
      },
    }
  }

  if (a && b) {
    const pa = parseWikiInput(a)
    const pb = parseWikiInput(b)
    const [ma, mb] = await Promise.all([
      fetchFileInfo(pa.host, pa.title, 1),
      fetchFileInfo(pb.host, pb.title, 1),
    ])
    return {
      heading: `${ma.fileTitle} vs ${mb.fileTitle}`,
      before: {
        src: ma.versions[0].thumbUrl,
        fullUrl: ma.versions[0].url,
        label: ma.fileTitle.replace(/^File:/, ''),
        uploadDate: fmtDate(ma.versions[0].timestamp),
        meta: ma,
      },
      after: {
        src: mb.versions[0].thumbUrl,
        fullUrl: mb.versions[0].url,
        label: mb.fileTitle.replace(/^File:/, ''),
        uploadDate: fmtDate(mb.versions[0].timestamp),
        meta: mb,
      },
    }
  }

  return null
}

function Attribution({ meta }: { meta: ImageMeta }) {
  const isCc = /^cc/i.test(meta.licenseShortName ?? '')
  return (
    <span className="attribution">
      <a href={meta.descriptionUrl} target="_blank" rel="noreferrer">
        {meta.fileTitle.replace(/^File:/, '')}
      </a>
      {meta.artistName && (
        <>
          {' '}
          by{' '}
          {meta.artistUrl ? (
            <a href={meta.artistUrl} target="_blank" rel="noreferrer">
              {meta.artistName}
            </a>
          ) : (
            meta.artistName
          )}
        </>
      )}
      {meta.licenseShortName && (
        <>
          ,{' '}
          {meta.licenseUrl ? (
            <a href={meta.licenseUrl} target="_blank" rel="noreferrer">
              {meta.licenseShortName}
            </a>
          ) : (
            meta.licenseShortName
          )}
        </>
      )}
      {isCc && ' 🙌'}
    </span>
  )
}

function attributionText(result: Result): string {
  const parts = [result.before.meta, result.after.meta]
    .filter((m, i, arr) => arr.findIndex((x) => x.fileTitle === m.fileTitle) === i)
    .map((m) => {
      let s = m.fileTitle.replace(/^File:/, '')
      if (m.artistName) s += ` by ${m.artistName}`
      if (m.licenseShortName) s += ` (${m.licenseShortName})`
      return s
    })
  return `${parts.join(' · ')} — via Wikimedia Commons`
}

function SidePane({ side }: { side: Side }) {
  return (
    <figure className="pane">
      <div className="pane-label">
        {side.label}
        <span className="pane-date"> · uploaded {side.uploadDate}</span>
      </div>
      <a href={side.fullUrl} target="_blank" rel="noreferrer">
        <img className="pane-img" src={side.src} alt={side.label} loading="lazy" />
      </a>
      <figcaption>
        <Attribution meta={side.meta} />
      </figcaption>
    </figure>
  )
}

export default function App() {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [wikiInput, setWikiInput] = useState('')
  const [fileA, setFileA] = useState('')
  const [fileB, setFileB] = useState('')
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [view, setView] = useState<'side-by-side' | 'slider'>('side-by-side')

  const load = useCallback(async () => {
    const params = readHash()
    if (![...params.keys()].length) {
      setState({ kind: 'idle' })
      return
    }
    setState({ kind: 'loading' })
    try {
      const result = await loadFromParams(params)
      setState(result ? { kind: 'result', result } : { kind: 'idle' })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('hashchange', load)
    return () => window.removeEventListener('hashchange', load)
  }, [load])

  useEffect(() => {
    document.title =
      state.kind === 'result'
        ? `${state.result.heading} · wciv`
        : 'wciv — wikimedia commons improvement viewer'
  }, [state])

  const submitWiki = (e: React.FormEvent) => {
    e.preventDefault()
    if (!wikiInput.trim()) return
    window.location.hash = new URLSearchParams({ wiki: wikiInput.trim() }).toString()
  }

  const submitFiles = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fileA.trim() || !fileB.trim()) return
    window.location.hash = new URLSearchParams({
      a: fileA.trim(),
      b: fileB.trim(),
    }).toString()
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const downloadPng = async (result: Result) => {
    setExporting(true)
    try {
      await exportComparisonPng({
        beforeSrc: result.before.src,
        afterSrc: result.after.src,
        beforeLabel: `${result.before.label} (${result.before.uploadDate})`,
        afterLabel: `${result.after.label} (${result.after.uploadDate})`,
        attribution: attributionText(result),
        fileName: 'before-after.png',
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>
          <a href="#" className="brand">
            wciv
          </a>{' '}
          <span className="tagline">wikimedia commons improvement viewer</span>
        </h1>
      </header>

      {state.kind === 'idle' && (
        <main className="forms">
          <form onSubmit={submitWiki} className="card">
            <h2>Compare a page image's last change</h2>
            <p>
              Paste a Wikipedia article URL to see its previous vs current lead
              image, or a Commons file URL to compare its two latest uploads.
            </p>
            <input
              value={wikiInput}
              onChange={(e) => setWikiInput(e.target.value)}
              placeholder="https://en.wikipedia.org/wiki/…"
              aria-label="Wikipedia article or Commons file URL"
            />
            <button type="submit">Compare versions</button>
          </form>

          <form onSubmit={submitFiles} className="card">
            <h2>Compare two Commons files</h2>
            <p>Paste two Wikimedia Commons file URLs or file names.</p>
            <input
              value={fileA}
              onChange={(e) => setFileA(e.target.value)}
              placeholder="Before — File:… or URL"
              aria-label="Before image"
            />
            <input
              value={fileB}
              onChange={(e) => setFileB(e.target.value)}
              placeholder="After — File:… or URL"
              aria-label="After image"
            />
            <button type="submit">Compare files</button>
          </form>
        </main>
      )}

      {state.kind === 'loading' && <main className="status">Loading images…</main>}

      {state.kind === 'error' && (
        <main className="status error">
          <p>{state.message}</p>
          <a href="#">← Start over</a>
        </main>
      )}

      {state.kind === 'result' && (
        <main className="result">
          <h2 className="result-heading">{state.result.heading}</h2>
          {view === 'side-by-side' ? (
            <div className="panes">
              <SidePane side={state.result.before} />
              <SidePane side={state.result.after} />
            </div>
          ) : (
            <>
              <CompareSlider
                beforeSrc={state.result.before.src}
                afterSrc={state.result.after.src}
                beforeLabel={`${state.result.before.label} (${state.result.before.uploadDate})`}
                afterLabel={`${state.result.after.label} (${state.result.after.uploadDate})`}
              />
              <div className="credits">
                <Attribution meta={state.result.before.meta} />
                {state.result.after.meta.fileTitle !==
                  state.result.before.meta.fileTitle && (
                  <Attribution meta={state.result.after.meta} />
                )}
              </div>
            </>
          )}
          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                setView(view === 'side-by-side' ? 'slider' : 'side-by-side')
              }
            >
              {view === 'side-by-side' ? 'Slider view' : 'Side-by-side view'}
            </button>
            <button onClick={copyLink}>{copied ? 'Copied!' : 'Copy permalink'}</button>
            <button onClick={() => downloadPng(state.result)} disabled={exporting}>
              {exporting ? 'Rendering…' : 'Download PNG'}
            </button>
            <a href="#" className="button-link">
              New comparison
            </a>
          </div>
        </main>
      )}

      <footer>
        <div>
          Images and metadata from{' '}
          <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">
            Wikimedia Commons
          </a>
          . Respect each image's license when sharing.
        </div>
        <div>
          made by{' '}
          <a href="https://tomzorz.me" target="_blank" rel="noreferrer">
            tomzorz
          </a>{' '}
          for the great people of{' '}
          <a href="https://www.wikiportraits.org" target="_blank" rel="noreferrer">
            wikiportraits
          </a>
          , or anyone else who finds it useful
        </div>
      </footer>
    </div>
  )
}
