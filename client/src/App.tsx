import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import {
  Activity, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2,
  CircleDot, Code2, GitBranch, Github, GitPullRequest, Globe2, LogIn, LogOut, Menu,
  Search, Sparkles, Star, Users, X,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { Dashboard } from './types'
import { buildInsights, compactNumber, formatDate, relativeDays } from './lib/analytics'
import { consumeGuestSearch, generateSummary, getSessionUser, useDashboard } from './hooks/useDashboard'
import { ContributionHeatmap } from './components/ContributionHeatmap'
import { ExportButtons } from './components/ExportButtons'
import { RepoCard } from './components/RepoCard'
import { ScoreBreakdown } from './components/ScoreBreakdown'
import { TimingPatterns } from './components/TimingPatterns'
import { CompareView } from './components/CompareView'

const fallbackUser = 'cgupta21'

function routeState() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path.startsWith('/compare')) {
    const params = new URLSearchParams(window.location.search)
    return { mode: 'compare' as const, username: '', left: params.get('a') || 'octocat', right: params.get('b') || 'torvalds' }
  }
  const match = path.match(/^\/u\/([^/]+)$/)
  return { mode: 'dashboard' as const, username: match ? decodeURIComponent(match[1]) : fallbackUser, left: '', right: '' }
}

function pushRoute(next: string) {
  window.history.pushState({}, '', next)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function useRoute() {
  const [route, setRoute] = useState(routeState)
  useEffect(() => {
    const handler = () => setRoute(routeState())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])
  return route
}

// Theme handling removed; always using original dark theme
// No useTheme hook needed

function useRecentSearches() {
  const [items, setItems] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('arsenic-recent-searches') || '[]') } catch { return [] }
  })
  const add = (value: string) => {
    const next = [value.replace(/^@/, '').trim(), ...items.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 8)
    setItems(next)
    localStorage.setItem('arsenic-recent-searches', JSON.stringify(next))
  }
  return { items, add }
}

export default function App() {
  const route = useRoute()
  const dark = true // always dark theme
  const recent = useRecentSearches()
  const [query, setQuery] = useState(route.username || fallbackUser)
  const [menu, setMenu] = useState(false)
  const [sessionUser, setSessionUser] = useState<{ login: string; name: string | null; avatar_url: string } | null>(null)
  const [loginPrompt, setLoginPrompt] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  // Generation counter to prevent stale /api/me from restoring auth after logout
  const meGenRef = useRef(0)

  useEffect(() => { setQuery(route.username || query) }, [route.username])

  const loadSessionUser = useCallback(async () => {
    const gen = ++meGenRef.current
    try {
      const { user } = await getSessionUser()
      if (gen === meGenRef.current) setSessionUser(user)
    } catch {
      if (gen === meGenRef.current) setSessionUser(null)
    }
  }, [])

  useEffect(() => { void loadSessionUser() }, [loadSessionUser])
  useEffect(() => {
    document.title = route.mode === 'compare' ? 'Arsenic — Compare Developers' : route.username ? `Arsenic — @${route.username}` : 'Arsenic — Developer Intelligence'
  }, [route])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const username = query.replace(/^@/, '').trim()
    if (!username) return

    if (!sessionUser) {
      try {
        const usage = await consumeGuestSearch()
        if (!usage.allowed) {
          setLoginPrompt(true)
          return
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message.toLowerCase() : ''
        if (message.includes('3 free searches') || message.includes('sign in with github')) {
          setLoginPrompt(true)
          return
        }
        console.error('Search access check failed:', caught)
        return
      }
    }

    recent.add(username)
    pushRoute(`/u/${encodeURIComponent(username)}`)
  }

  const signOut = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try {
      const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      if (!response.ok) throw new Error('Server returned an error during logout.')
      // Cancel any in-flight /api/me that could race and restore auth state
      meGenRef.current += 1
      setSessionUser(null)
      // Re-verify server confirms logged out
      const gen = ++meGenRef.current
      try {
        const { user } = await getSessionUser()
        // Only apply if no newer call has started (e.g. a re-login)
        if (gen === meGenRef.current && user !== null) {
          console.warn('Logout verification: /api/me still returned a user — forcing null.')
          setSessionUser(null)
        }
      } catch { /* verification fetch failed; session was still cleared */ }
      setToast({ message: 'Signed out successfully.', type: 'success' })
    } catch (error) {
      console.error('Sign-out failed:', error)
      setToast({ message: 'Could not sign out. Please try again.', type: 'error' })
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className='app dark'>
      <header className="topbar">
        <button className="brand brandButton" onClick={() => pushRoute(`/u/${encodeURIComponent(fallbackUser)}`)} aria-label="Go to Arsenic home">
          <img className="brandLogo" src="/assets/arsenic-logo.svg" alt="Arsenic" />
        </button>
        <nav className={menu ? 'nav open' : 'nav'} aria-label="Primary navigation">
          <button onClick={() => pushRoute(`/u/${route.username || fallbackUser}`)}>Overview</button>
          <button onClick={() => document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' })}>Activity</button>
          <button onClick={() => document.getElementById('repositories')?.scrollIntoView({ behavior: 'smooth' })}>Repositories</button>
          <button onClick={() => document.getElementById('insights')?.scrollIntoView({ behavior: 'smooth' })}>Insights</button>
          <button onClick={() => pushRoute('/compare')}>Compare</button>
        </nav>
        <div className="actions">

          {sessionUser ? (
            <button className="accountBtn" onClick={signOut} disabled={loggingOut} title={loggingOut ? 'Signing out…' : `Sign out @${sessionUser.login}`}><img src={sessionUser.avatar_url} alt="" /><LogOut size={15} /></button>
          ) : (
            <a className="outlineBtn authBtn" href="/auth/github" title="Sign in with GitHub"><Github size={15} />Sign in</a>
          )}
          <button className="iconBtn mobileOnly" onClick={() => setMenu((value) => !value)} aria-label="Open navigation">
            {menu ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </header>

      {route.mode === 'compare' ? (
        <main><CompareView initialLeft={route.left} initialRight={route.right} /></main>
      ) : (
        <DashboardView
          username={route.username}
          query={query}
          setQuery={setQuery}
          onSubmit={submit}
          recentSearches={recent.items}
          onRecentSearch={async (name) => {
            if (!sessionUser) {
              try {
                const usage = await consumeGuestSearch()
                if (!usage.allowed) {
                  setLoginPrompt(true)
                  return
                }
              } catch (caught) {
                const message = caught instanceof Error ? caught.message.toLowerCase() : ''
                if (message.includes('3 free searches') || message.includes('sign in with github')) {
                  setLoginPrompt(true)
                  return
                }
                console.error('Search access check failed:', caught)
                return
              }
            }
            setQuery(name)
            recent.add(name)
            pushRoute(`/u/${encodeURIComponent(name)}`)
          }}
          sessionUser={sessionUser}
        />
      )}

      {loginPrompt && (
        <div className="loginPromptOverlay" role="dialog" aria-modal="true" aria-labelledby="loginPromptTitle" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginPrompt(false) }}>
          <div className="loginPrompt">
            <button className="loginPromptClose" onClick={() => setLoginPrompt(false)} aria-label="Close"><X size={17} /></button>
            <div className="loginPromptIcon"><Github size={22} /></div>
            <h2 id="loginPromptTitle">You’ve used your 3 free searches.</h2>
            <p>Sign in with GitHub to continue analyzing developer profiles without refreshing or losing your place.</p>
            <a className="primaryBtn loginPromptButton" href="/auth/github"><Github size={16} /> Sign in with GitHub</a>
            <button className="ghostBtn loginPromptLater" onClick={() => setLoginPrompt(false)}>Maybe later</button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <footer>
        <div className="brand"><img className="brandLogo footerLogo" src="/assets/arsenic-logo.svg" alt="Arsenic" /></div>
        <span>Arsenic · GitHub Developer Intelligence</span>
        <span>Built by cgupta21 · <a href="https://github.com/cgupta21" target="_blank" rel="noopener noreferrer">GitHub ↗</a></span>
      </footer>
    </div>
  )
}

function DashboardView({
  username, query, setQuery, onSubmit, recentSearches, onRecentSearch, sessionUser,
}: {
  username: string
  query: string
  setQuery: (value: string) => void
  onSubmit: (event: FormEvent) => void
  recentSearches: string[]
  onRecentSearch: (name: string) => void
  sessionUser: { login: string } | null
}) {
  const { data, loading, error } = useDashboard(username)
  const [sort, setSort] = useState<'updated' | 'stars' | 'language'>('updated')
  const [status, setStatus] = useState<'all' | 'active' | 'watch' | 'stale' | 'archived'>('all')
  const [language, setLanguage] = useState('all')
  const [summary, setSummary] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSummary('')
    setSummaryLoading(false)
  }, [username])

  const repos = useMemo(() => {
    if (!data) return []
    return [...data.repos]
      .filter((repo) => status === 'all' || repo.status === status)
      .filter((repo) => language === 'all' || repo.language === language)
      .sort((a, b) => {
        if (sort === 'stars') return b.stargazers_count - a.stargazers_count
        if (sort === 'language') return (a.language || 'zzzz').localeCompare(b.language || 'zzzz')
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })
  }, [data, language, sort, status])

  const insights = useMemo(() => data ? buildInsights(data) : [], [data])
  const weeklyActivity = useMemo(() => {
    if (!data) return []
    const days = [...data.contributions.days].sort((a, b) => a.date.localeCompare(b.date)).slice(-56)
    return Array.from({ length: 8 }, (_, index) => {
      const chunk = days.slice(index * 7, index * 7 + 7)
      return { week: chunk[0]?.date ? new Date(chunk[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—', activity: chunk.reduce((sum, day) => sum + day.contributionCount, 0) }
    })
  }, [data])

  const aiSummary = async () => {
    if (!data || summaryLoading) return
    setSummaryLoading(true)
    try { setSummary((await generateSummary(data.user.login)).summary) } catch (caught) { setSummary(caught instanceof Error ? caught.message : 'Developer summary unavailable.') } finally { setSummaryLoading(false) }
  }

  return (
    <>
      <main>
        <section className="hero">
          <div className="heroCopy">
            <div className="eyebrow"><span className="pulseDot" /> GITHUB DEVELOPER INTELLIGENCE</div>
            <h1>Understand the chemistry<br /><em>behind your code.</em></h1>
            <p>Turn GitHub activity into intelligent signals about projects, consistency, collaboration, code volume, and repository health.</p>
            <div className="heroActions"><button className="textLink" onClick={() => pushRoute('/compare')}><Users size={15} /> Compare developers</button>{recentSearches.length > 0 && <span className="recentHint">Recent: {recentSearches.slice(0, 3).map((item) => <button key={item} onClick={() => onRecentSearch(item)}>{item}</button>)}</span>}</div>
          </div>
          <form className="searchBox" onSubmit={onSubmit}>
            <Search size={18} aria-hidden="true" />
            <input aria-label="GitHub username" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter GitHub username" />
            <button disabled={loading}>{loading ? 'Loading…' : 'Analyze'}</button>
          </form>
        </section>

        {error && <div className="error" role="alert"><CircleDot size={17} /><div><b>{error}</b>{error.toLowerCase().includes('rate') && <small>GitHub can return 403 or 429 for primary and secondary limits. Wait for the reset or retry-after window instead of repeatedly retrying.</small>}</div></div>}
        {loading && !data ? <div className="loading">Reading GitHub signals for @{username}…</div> : data ? <DashboardContent data={data} repos={repos} sort={sort} setSort={setSort} status={status} setStatus={setStatus} language={language} setLanguage={setLanguage} weeklyActivity={weeklyActivity} insights={insights} shareRef={shareRef} summary={summary} summaryLoading={summaryLoading} aiSummary={aiSummary} sessionUser={sessionUser} /> : null}
      </main>
    </>
  )
}

function DashboardContent({
  data, repos, sort, setSort, status, setStatus, language, setLanguage, weeklyActivity, insights, shareRef, summary, summaryLoading, aiSummary, sessionUser,
}: {
  data: Dashboard
  repos: Dashboard['repos']
  sort: 'updated' | 'stars' | 'language'
  setSort: (value: 'updated' | 'stars' | 'language') => void
  status: 'all' | 'active' | 'watch' | 'stale' | 'archived'
  setStatus: (value: 'all' | 'active' | 'watch' | 'stale' | 'archived') => void
  language: string
  setLanguage: (value: string) => void
  weeklyActivity: { week: string; activity: number }[]
  insights: string[]
  shareRef: RefObject<HTMLDivElement>
  summary: string
  summaryLoading: boolean
  aiSummary: () => void
  sessionUser: { login: string } | null
}) {
  const user = data.user
  const languages = data.languages
  const score = data.score
  const privateForSelf = Boolean(sessionUser && sessionUser.login.toLowerCase() === user.login.toLowerCase())

  return (
    <>
      {!data.authenticated && <div className="notice"><LogIn size={16} /> Public API mode: activity is estimated from GitHub's public events feed (about the last 90 days). Add <code>GITHUB_TOKEN</code> on the server for the full contribution calendar and exact language volume.</div>}
      {data.api.graphqlRemaining !== null && <div className="rateBar"><span>GitHub GraphQL remaining: <b>{data.api.graphqlRemaining}</b></span><span>Cache: {Math.round(data.api.cacheTtlSeconds / 60)} min</span>{privateForSelf && <span>Private contribution counts enabled</span>}</div>}

      <section id="overview" className="profileCard">
        <img src={user.avatar_url} className="avatar" alt={`${user.login} avatar`} />
        <div className="profileInfo">
          <div className="profileName"><h2>{user.name || user.login}</h2><a href={user.html_url} target="_blank" rel="noreferrer" aria-label={`Open ${user.login} on GitHub`}><ArrowUpRight size={15} /></a></div>
          <div className="handle">@{user.login}</div>
          <p>{user.bio || 'No GitHub bio provided.'}</p>
          <div className="meta">
            {user.location && <span><Globe2 size={14} />{user.location}</span>}
            <span><CalendarDays size={14} />Joined {formatDate(user.created_at)}</span>
            <span><Users size={14} />{compactNumber(user.followers)} followers</span>
          </div>
        </div>
        <a className="outlineBtn" href={user.html_url} target="_blank" rel="noreferrer">View GitHub <ArrowUpRight size={15} /></a>
      </section>

      <section className="statsGrid" aria-label="Developer metrics">
        <Stat icon={<GitBranch />} value={user.public_repos} label="Public repos" />
        <Stat icon={<Activity />} value={data.contributions.total} label="Contributions / year" />
        <Stat icon={<GitPullRequest />} value={score.raw.prs} label="Pull requests" />
        <Stat icon={<Star />} value={score.raw.stars} label="Repository stars" />
        <Stat icon={<CircleDot />} value={data.contributions.currentStreak} label="Current streak" />
        <Stat icon={<Sparkles />} value={score.score} label="Arsenic score" accent />
      </section>

      <section className="dashboardGrid">
        <Card title="Score anatomy" icon={<Sparkles />} action={`Overall ${score.score}/100`}><ScoreBreakdown score={score} /></Card>
        <Card title={data.estimated ? 'Recent contribution signal (~90 days)' : 'One-year contribution signal'} icon={<BarChart3 />} action={data.estimated ? `${data.contributions.activeDays} active days · est.` : `${data.contributions.activeDays} active days`}><ContributionHeatmap data={data} /></Card>
      </section>

      <section id="activity" className="dashboardGrid">
        <Card title="8-week contribution trend" icon={<BarChart3 />} action="Contribution calendar"><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weeklyActivity}><defs><linearGradient id="fillArsenic" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#C96A45" stopOpacity=".42" /><stop offset="100%" stopColor="#C96A45" stopOpacity="0" /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" /><XAxis dataKey="week" stroke="var(--muted)" fontSize={11} /><YAxis allowDecimals={false} stroke="var(--muted)" fontSize={11} /><Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)' }} /><Area type="monotone" dataKey="activity" stroke="#C96A45" fill="url(#fillArsenic)" strokeWidth={2.5} /></AreaChart></ResponsiveContainer></div></Card>
        <Card title="Language mix by code volume" icon={<Code2 />} action={`${languages.length} detected`}>
          <div className="languageList">{languages.length ? languages.map((item) => <div className="langRow" key={item.name}><div className="langLabel"><span className="langDot" style={{ background: item.color || 'var(--terracotta)' }} />{item.name}<b>{item.pct}%</b></div><div className="bar"><span style={{ width: `${item.pct}%`, background: item.color || 'var(--terracotta)' }} /></div></div>) : <Empty text="No language data found." />}</div>
          <p className="mutedSmall">{data.authenticated ? 'Aggregated from repository language byte counts.' : 'Public-mode fallback: primary language signals. Add GITHUB_TOKEN for code-volume accuracy.'}</p>
        </Card>
      </section>

      <section className="dashboardGrid">
        <Card title="Commit timing patterns" icon={<CalendarDays />} action="Sampled recent commits"><TimingPatterns data={data} /></Card>
        <Card title="Developer insights" icon={<Sparkles />} action={`${insights.length} signals`}><div className="insights">{insights.map((item, index) => <div className="insight" key={item}><span className="insightNum">0{index + 1}</span><span>{item}</span></div>)}</div></Card>
      </section>

      <section id="repositories">
        <div className="sectionHead"><div><h2>Repository portfolio</h2><p>{data.repos.length} repositories analyzed with health signals instead of a fixed six-card preview.</p></div><div className="filters"><select aria-label="Repository status filter" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="all">All status</option><option value="active">Active</option><option value="watch">Watch</option><option value="stale">Stale</option><option value="archived">Archived</option></select><select aria-label="Repository language filter" value={language} onChange={(e) => setLanguage(e.target.value)}><option value="all">All languages</option>{data.languages.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select><select aria-label="Repository sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="stars">Most stars</option><option value="language">Language</option></select></div></div>
        <div className="repoGrid">{repos.map((repo) => <RepoCard key={repo.id} repo={repo} />)}</div>
        {!repos.length && <Empty text="No repositories match the selected filters." />}
      </section>

      <section id="insights" className="dashboardGrid bottom">
        <Card title="Intelligent developer summary" icon={<Sparkles />} action="Deterministic analysis">
          <div className="aiPanel">{summary ? <div className="aiText">{summary}</div> : <p className="mutedSmall">Generate a concise summary directly from the GitHub metrics Arsenic collected. No external AI service or paid API key is required.</p>}<button className="primaryBtn" onClick={aiSummary} disabled={summaryLoading}>{summaryLoading ? 'Building…' : 'Generate summary'} <Sparkles size={15} /></button></div>
        </Card>
        <Card title="Recent GitHub activity" icon={<Activity />} action={`${data.events.length} events`}>
          <div className="events">{data.events.slice(0, 8).map((event) => <div className="event" key={event.id}><div className="eventIcon"><CheckCircle2 size={15} /></div><div><b>{event.type.replace('Event', '')}</b><small>{event.repo.name} · {relativeDays(event.created_at)}d ago</small></div></div>)}</div>
        </Card>
      </section>

      <section className="shareSection">
        <div className="sectionHead compact"><div><h2>Share Arsenic profile</h2><p>Export a clean card for a portfolio, report, or project demo.</p></div></div>
        <div className="shareLayout">
          <div className="shareCard" ref={shareRef} id="share-card">
            <div className="shareBrand"><img src="/assets/arsenic-mark.svg" alt="" /><span>ARSENIC</span></div>
            <div className="shareIdentity"><img src={user.avatar_url} alt="" /><div><h3>{user.name || user.login}</h3><span>@{user.login}</span></div><strong>{score.score}</strong></div>
            <div className="shareGrid"><div><b>{compactNumber(data.contributions.total)}</b><span>contributions</span></div><div><b>{score.breakdown.consistency}</b><span>consistency</span></div><div><b>{score.breakdown.collaboration}</b><span>collaboration</span></div><div><b>{score.breakdown.impact}</b><span>impact</span></div></div>
            <div className="shareFooter">GitHub Developer Intelligence · arsenic</div>
          </div>
          <ExportButtons targetId="share-card" />
        </div>
      </section>
    </>
  )
}

function Stat({ icon, value, label, accent = false }: { icon: ReactNode; value: number; label: string; accent?: boolean }) {
  return <div className={accent ? 'stat accent' : 'stat'}><div className="statIcon">{icon}</div><strong>{compactNumber(value)}</strong><span>{label}</span></div>
}

function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: string; children: ReactNode }) {
  return <div className="card"><div className="cardHead"><h3>{icon}{title}</h3>{action && <span>{action}</span>}</div>{children}</div>
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div> }

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const id = setTimeout(onClose, 3000)
    return () => clearTimeout(id)
  }, [onClose])
  return (
    <div
      className={`toast toast--${type}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>{message}</span>
      <button className="toastClose" onClick={onClose} aria-label="Dismiss notification"><X size={13} /></button>
    </div>
  )
}
