export interface ImageVersion {
  url: string
  thumbUrl: string
  timestamp: string
  uploader?: string
}

export interface ImageMeta {
  fileTitle: string
  descriptionUrl: string
  artistName?: string
  artistUrl?: string
  licenseShortName?: string
  licenseUrl?: string
  versions: ImageVersion[] // newest first
}

const THUMB_WIDTH = 1600

interface RawImageInfo {
  url: string
  thumburl?: string
  timestamp: string
  user?: string
  descriptionurl?: string
  extmetadata?: Record<string, { value: string }>
}

function apiUrl(host: string, params: Record<string, string>): string {
  const search = new URLSearchParams({
    format: 'json',
    origin: '*',
    ...params,
  })
  return `https://${host}/w/api.php?${search}`
}

async function apiGet(host: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(apiUrl(host, params))
  if (!res.ok) throw new Error(`API request to ${host} failed (${res.status})`)
  return res.json()
}

/** Extract plain-text name and first link from the extmetadata Artist HTML blob. */
function parseArtist(html: string): { name: string; url?: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const anchor = doc.querySelector('a')
  let url = anchor?.getAttribute('href') ?? undefined
  if (url && url.startsWith('//')) url = 'https:' + url
  if (url && url.startsWith('/')) url = 'https://commons.wikimedia.org' + url
  const name = doc.body.textContent?.trim() || 'Unknown'
  return { name, url }
}

function toImageMeta(fileTitle: string, infos: RawImageInfo[]): ImageMeta {
  const meta = infos[0]?.extmetadata ?? {}
  const artistHtml = meta.Artist?.value
  const artist = artistHtml ? parseArtist(artistHtml) : undefined
  let licenseUrl = meta.LicenseUrl?.value
  if (licenseUrl && licenseUrl.startsWith('//')) licenseUrl = 'https:' + licenseUrl
  return {
    fileTitle,
    descriptionUrl:
      infos[0]?.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`,
    artistName: artist?.name,
    artistUrl: artist?.url,
    licenseShortName: meta.LicenseShortName?.value,
    licenseUrl,
    versions: infos.map((i) => ({
      url: i.url,
      thumbUrl: i.thumburl ?? i.url,
      timestamp: i.timestamp,
      uploader: i.user,
    })),
  }
}

/** Fetch imageinfo (with upload history) for a file on a given wiki. */
export async function fetchFileInfo(
  host: string,
  fileTitle: string,
  limit = 2,
): Promise<ImageMeta> {
  const title = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`
  const data = await apiGet(host, {
    action: 'query',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|timestamp|user|extmetadata',
    iilimit: String(limit),
    iiurlwidth: String(THUMB_WIDTH),
  })
  const pages = data?.query?.pages ?? {}
  const page: any = Object.values(pages)[0]
  const infos: RawImageInfo[] | undefined = page?.imageinfo
  if (!infos || infos.length === 0) {
    throw new Error(`Could not find image info for "${title}" on ${host}`)
  }
  return toImageMeta(page.title ?? title, infos)
}

/** Resolve a Wikipedia article to its main (page) image file title. */
export async function fetchArticleMainImage(
  host: string,
  articleTitle: string,
): Promise<string> {
  const data = await apiGet(host, {
    action: 'query',
    titles: articleTitle,
    prop: 'pageimages',
    piprop: 'name',
    redirects: '1',
  })
  const pages = data?.query?.pages ?? {}
  const page: any = Object.values(pages)[0]
  if (!page || page.missing !== undefined) {
    throw new Error(`Article "${articleTitle}" not found on ${host}`)
  }
  const name: string | undefined = page.pageimage
  if (!name) {
    throw new Error(`Article "${articleTitle}" has no main image`)
  }
  return `File:${name}`
}

const IMAGE_EXT = 'jpe?g|png|gif|svg|webp|tiff?'

/** Extract the first (lead/infobox) image filename from article wikitext. */
export function extractLeadImage(wikitext: string): string | undefined {
  const patterns = [
    new RegExp(`\\b(?:File|Image)\\s*:\\s*([^|\\]{}\\n]+?\\.(?:${IMAGE_EXT}))`, 'i'),
    new RegExp(
      `\\|\\s*(?:image|image_name|img|logo|photo)\\d*\\s*=\\s*([^|\\n{}\\[\\]]+?\\.(?:${IMAGE_EXT}))\\s*(?:[|\\n}])`,
      'i',
    ),
  ]
  let best: { index: number; name: string } | undefined
  for (const re of patterns) {
    const m = re.exec(wikitext)
    if (m && (best === undefined || m.index < best.index)) {
      best = { index: m.index, name: m[1] }
    }
  }
  return best ? normalizeFileName(best.name) : undefined
}

export function normalizeFileName(name: string): string {
  const clean = name.replace(/^(File|Image):/i, '').replace(/_/g, ' ').trim()
  if (!clean) return clean
  return clean[0].toUpperCase() + clean.slice(1)
}

export interface ArticleImageChange {
  currentFile: string // "File:..." title of the current lead image
  previousFile: string // "File:..." title of the previous, different lead image
  changedAt: string // ISO timestamp of the revision that introduced the current image
  previousUntil: string // ISO timestamp of the last revision showing the previous image
}

/**
 * Walk an article's revision history (lead section wikitext) to find the most
 * recent revision where the lead image was a *different file* than today's.
 * Returns null if no change was found within `maxRevisions`.
 */
export async function findArticleImageChange(
  host: string,
  articleTitle: string,
  maxRevisions = 200,
): Promise<ArticleImageChange | null> {
  const currentFile = await fetchArticleMainImage(host, articleTitle)
  const currentName = normalizeFileName(currentFile)

  let rvcontinue: string | undefined
  let fetched = 0
  // timestamp of the newest revision that still shows the current image
  let changedAt = new Date().toISOString()

  while (fetched < maxRevisions) {
    const params: Record<string, string> = {
      action: 'query',
      titles: articleTitle,
      redirects: '1',
      prop: 'revisions',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      rvsection: '0',
      rvlimit: '50',
    }
    if (rvcontinue) params.rvcontinue = rvcontinue
    const data = await apiGet(host, params)
    const pages = data?.query?.pages ?? {}
    const page: any = Object.values(pages)[0]
    const revisions: any[] = page?.revisions ?? []
    if (revisions.length === 0) break

    for (const rev of revisions) {
      fetched++
      const wikitext: string | undefined = rev?.slots?.main?.['*']
      if (typeof wikitext !== 'string') continue
      const lead = extractLeadImage(wikitext)
      if (!lead) continue
      if (lead.toLowerCase() === currentName.toLowerCase()) {
        changedAt = rev.timestamp
      } else {
        return {
          currentFile,
          previousFile: `File:${lead}`,
          changedAt,
          previousUntil: rev.timestamp,
        }
      }
      if (fetched >= maxRevisions) break
    }

    rvcontinue = data?.continue?.rvcontinue
    if (!rvcontinue) break
  }
  return null
}

export interface ParsedWikiInput {
  host: string
  title: string
  isFile: boolean
}

/**
 * Parse user input: a full wiki/commons URL, a bare "File:..." name,
 * or a bare Commons file name.
 */
export function parseWikiInput(input: string): ParsedWikiInput {
  const trimmed = input.trim()
  if (/^(https?:)?\/\//i.test(trimmed)) {
    const url = new URL(trimmed.startsWith('http') ? trimmed : 'https:' + trimmed)
    let title = ''
    if (url.pathname.startsWith('/wiki/')) {
      title = decodeURIComponent(url.pathname.slice('/wiki/'.length))
    } else if (url.searchParams.has('title')) {
      title = url.searchParams.get('title')!
    } else {
      throw new Error(`Could not extract a page title from ${trimmed}`)
    }
    title = title.replace(/_/g, ' ')
    return { host: url.host, title, isFile: title.startsWith('File:') }
  }
  // bare name -> assume Commons file
  const title = trimmed.replace(/_/g, ' ')
  return {
    host: 'commons.wikimedia.org',
    title: title.startsWith('File:') ? title : `File:${title}`,
    isFile: true,
  }
}
