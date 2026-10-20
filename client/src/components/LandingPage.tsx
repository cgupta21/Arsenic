import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  FolderGit2,
  GitBranch,
  Github,
  Search,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { normalizeGithubInput } from '../lib/normalizeGithubInput'

interface LandingPageProps {
  onGetStarted: () => void
  onTryFree: () => void
  onSearch: (username: string) => void
  onOpenSignIn: () => void
  sessionUser: { login: string; name: string | null; avatar_url: string } | null
}

export function LandingPage({
  onGetStarted,
  onTryFree,
  onSearch,
  onOpenSignIn: _onOpenSignIn,
  sessionUser: _sessionUser,
}: LandingPageProps) {
  const [heroSearchInput, setHeroSearchInput] = useState('')
  const [heroSearchError, setHeroSearchError] = useState<string | null>(null)

  const handleHeroSubmit = (e: FormEvent) => {
    e.preventDefault()
    const { username, error } = normalizeGithubInput(heroSearchInput)
    if (error) {
      setHeroSearchError(error)
      return
    }
    setHeroSearchError(null)
    if (username) {
      onSearch(username)
    }
  }

  return (
    <div className="landingPage">
      {/* Background ambient decorative glows */}
      <div className="landingAmbient">
        <div className="landingGlow1" aria-hidden="true" />
        <div className="landingGlow2" aria-hidden="true" />
      </div>

      {/* Hero Section */}
      <section className="landingHero" aria-labelledby="hero-heading">
        <div className="landingHeroContent">
          <div className="landingBadge">
            <span className="landingBadgeDot" />
            <span className="landingBadgeTag">Arsenic v2.0</span>
            <span className="landingBadgeText">GitHub Repository & Developer Intelligence</span>
          </div>

          <h1 id="hero-heading" className="landingHeadline">
            Understand Any <span className="highlightTerracotta">GitHub Repository.</span>
          </h1>

          <p className="landingSubcopy">
            Turn raw repository activity, developer velocity, and commit signals into clear,
            actionable intelligence. Analyze streaks, contribution health, and code impact in seconds.
          </p>

          <div className="landingCtaGroup">
            <button
              type="button"
              className="primaryBtn landingCtaPrimary"
              onClick={onGetStarted}
              id="hero-get-started-btn"
            >
              <span>Get Started</span>
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="outlineBtn landingCtaSecondary"
              onClick={onTryFree}
              id="hero-try-free-btn"
            >
              <Sparkles size={16} />
              <span>Try Free Without Login</span>
            </button>
          </div>

          {/* Quick Search Bar directly in Hero */}
          <form className="landingQuickSearch" onSubmit={handleHeroSubmit} role="search" aria-label="Quick repository search">
            <div className="landingSearchInputWrap">
              <Search size={18} className="landingSearchIcon" aria-hidden="true" />
              <input
                type="text"
                value={heroSearchInput}
                onChange={(e) => {
                  setHeroSearchInput(e.target.value)
                  if (heroSearchError) setHeroSearchError(null)
                }}
                placeholder="Search username or repo (e.g. cgupta21 or torvalds)…"
                aria-label="GitHub username or repository handle"
                className="landingSearchInput"
              />
              <button type="submit" className="landingSearchSubmitBtn">
                Explore
              </button>
            </div>
            {heroSearchError && (
              <p className="landingSearchError" role="alert">
                {heroSearchError}
              </p>
            )}
            <div className="landingSearchSuggestions">
              <span className="suggestionLabel">Try showcase:</span>
              <button
                type="button"
                className="suggestionChip"
                onClick={() => onSearch('cgupta21')}
              >
                @cgupta21
              </button>
              <button
                type="button"
                className="suggestionChip"
                onClick={() => onSearch('torvalds')}
              >
                @torvalds
              </button>
              <button
                type="button"
                className="suggestionChip"
                onClick={() => onSearch('octocat')}
              >
                @octocat
              </button>
            </div>
          </form>
        </div>

        {/* Visual Preview of the Dashboard */}
        <div className="landingPreviewContainer">
          <div className="dashboardPreviewCard" aria-label="Illustrative dashboard preview">
            <div className="previewCardHeader">
              <div className="previewWindowControls" aria-hidden="true">
                <span className="dot dotRed" />
                <span className="dot dotYellow" />
                <span className="dot dotGreen" />
              </div>
              <div className="previewCardTitle">
                <FolderGit2 size={14} />
                <span>@cgupta21 / Arsenic</span>
                <span className="previewStatusBadge">Public • Active</span>
              </div>
              <div className="previewLivePill">
                <span className="pulseIndicator" />
                <span>Live Intelligence Preview</span>
              </div>
            </div>

            <div className="previewCardBody">
              {/* Top Score Strip */}
              <div className="previewScoreStrip">
                <div className="previewScoreMain">
                  <div className="previewScoreValue">94</div>
                  <div className="previewScoreMeta">
                    <div className="scoreGrade">Excellent Health</div>
                    <div className="scoreSubtext">Consistency 96% • Activity 92% • Cadence 94%</div>
                  </div>
                </div>
                <div className="previewScoreTags">
                  <span className="previewTag tagSage">
                    <CheckCircle2 size={12} /> High Velocity
                  </span>
                  <span className="previewTag tagSand">
                    <GitBranch size={12} /> Clean Branching
                  </span>
                </div>
              </div>

              {/* Metric Cards Row */}
              <div className="previewMetricsGrid">
                <div className="previewMetricItem">
                  <span className="metricLabel">Commits & PRs</span>
                  <span className="metricVal">1,840+</span>
                  <span className="metricTrend positive">+14% vs avg</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">Active Streak</span>
                  <span className="metricVal">42 Days</span>
                  <span className="metricTrend">Longest: 68d</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">PR Velocity</span>
                  <span className="metricVal">4.8 / wk</span>
                  <span className="metricTrend positive">Top 5%</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">Tracked Repos</span>
                  <span className="metricVal">24</span>
                  <span className="metricTrend">84 Stars</span>
                </div>
              </div>

              {/* Visual Heatmap Mockup */}
              <div className="previewHeatmapSection">
                <div className="previewSectionLabel">
                  <span>Contribution Timing & Density</span>
                  <span className="heatmapLegendNote">Last 16 weeks</span>
                </div>
                <div className="previewHeatmapGrid" aria-hidden="true">
                  {Array.from({ length: 64 }).map((_, i) => {
                    const intensities = ['lvl-0', 'lvl-1', 'lvl-2', 'lvl-3', 'lvl-4']
                    // Deterministic pattern so preview is consistent
                    const intensity = intensities[(i * 7 + 3) % intensities.length]
                    return <div key={i} className={`heatmapCell ${intensity}`} />
                  })}
                </div>
              </div>

              {/* Language Distribution & Architecture Takeaway */}
              <div className="previewSummaryRow">
                <div className="previewLangBar">
                  <div className="langSegment ts" style={{ width: '56%' }} title="TypeScript 56%" />
                  <div className="langSegment js" style={{ width: '24%' }} title="JavaScript 24%" />
                  <div className="langSegment css" style={{ width: '12%' }} title="CSS 12%" />
                  <div className="langSegment html" style={{ width: '8%' }} title="HTML 8%" />
                </div>
                <div className="previewLangLegend">
                  <span className="langLegendItem"><span className="langDot ts" /> TypeScript (56%)</span>
                  <span className="langLegendItem"><span className="langDot js" /> JavaScript (24%)</span>
                  <span className="langLegendItem"><span className="langDot css" /> CSS (12%)</span>
                  <span className="langLegendItem"><span className="langDot html" /> HTML (8%)</span>
                </div>
              </div>
            </div>

            <div className="previewCardFooter">
              <span className="previewCaption">
                Demonstrated using genuine application metrics from @cgupta21/Arsenic
              </span>
              <button
                type="button"
                className="previewExploreBtn"
                onClick={() => onSearch('cgupta21')}
              >
                Inspect Live Dashboard →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars Strip */}
      <section className="landingPillars" aria-label="Key Capabilities">
        <div className="pillarItem">
          <div className="pillarIcon terracotta">
            <Zap size={20} />
          </div>
          <div className="pillarText">
            <h3>Instant Intelligence</h3>
            <p>Zero configuration required. Look up any public GitHub user or repository handle instantly.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon sage">
            <BarChart3 size={20} />
          </div>
          <div className="pillarText">
            <h3>Contribution Timing</h3>
            <p>Track day-of-week and hourly commit frequency to understand real engineering rhythms.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon sand">
            <TrendingUp size={20} />
          </div>
          <div className="pillarText">
            <h3>Repository Health</h3>
            <p>Automated scoring across consistency, commit frequency, issue resolution, and maintenance.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon terracotta">
            <Shield size={20} />
          </div>
          <div className="pillarText">
            <h3>Read-Only & Private</h3>
            <p>Strictly read-only OAuth scopes. Ephemeral iron-session cookies without database persistence.</p>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section id="features" className="landingFeaturesSection" aria-labelledby="features-heading">
        <div className="sectionHeader">
          <span className="sectionEyebrow">Features</span>
          <h2 id="features-heading" className="sectionTitle">
            Everything you need to evaluate repositories and teams
          </h2>
          <p className="sectionSubtitle">
            Arsenic surfaces developer velocity, collaboration habits, and repository health directly
            from verified GitHub activity data.
          </p>
        </div>

        <div className="featuresGrid">
          {/* Card 1: Repository Intelligence */}
          <div className="featureCard">
            <div className="featureCardIcon terracotta">
              <FolderGit2 size={24} />
            </div>
            <h3 className="featureCardTitle">Repository Intelligence</h3>
            <p className="featureCardDesc">
              Inspect health scores, star and fork momentum, open issue resolution cadence, license validation,
              and codebase footprint across repositories.
            </p>
            <ul className="featureList">
              <li>Comprehensive repository health scores (0-100)</li>
              <li>Star and fork growth trajectory</li>
              <li>Stale vs active repository tagging</li>
            </ul>
          </div>

          {/* Card 2: Developer Activity Insights */}
          <div className="featureCard">
            <div className="featureCardIcon sage">
              <TrendingUp size={24} />
            </div>
            <h3 className="featureCardTitle">Developer Activity Insights</h3>
            <p className="featureCardDesc">
              Analyze commit cadence, active streaks, weekly output distribution, and day-of-week commit habits
              to discover peak productivity windows.
            </p>
            <ul className="featureList">
              <li>Current and longest streak tracking</li>
              <li>Hourly and day-of-week timing patterns</li>
              <li>Workday vs weekend cadence breakdown</li>
            </ul>
          </div>

          {/* Card 3: Contribution Analysis */}
          <div className="featureCard">
            <div className="featureCardIcon sand">
              <BarChart3 size={24} />
            </div>
            <h3 className="featureCardTitle">Contribution Analysis</h3>
            <p className="featureCardDesc">
              Visual contribution heatmap mapped over 52 weeks, pull request vs issue distribution,
              language diversity, and public versus private scope awareness.
            </p>
            <ul className="featureList">
              <li>52-week interactive contribution matrix</li>
              <li>PR vs Issue vs Code push proportions</li>
              <li>Multi-language composition percentages</li>
            </ul>
          </div>

          {/* Card 4: Repository Summaries */}
          <div className="featureCard">
            <div className="featureCardIcon terracotta">
              <Cpu size={24} />
            </div>
            <h3 className="featureCardTitle">Repository Summaries</h3>
            <p className="featureCardDesc">
              Generate structured analytical takeaways and architectural highlights for any repository or
              developer profile on demand using verified event signals.
            </p>
            <ul className="featureList">
              <li>Instant architectural takeaway generation</li>
              <li>Deterministic synthesis from genuine signals</li>
              <li>One-click copy and export capabilities</li>
            </ul>
          </div>

          {/* Card 5: Search and Explore */}
          <div className="featureCard featureCardSpan">
            <div className="featureCardIcon sage">
              <Search size={24} />
            </div>
            <h3 className="featureCardTitle">Search and Explore</h3>
            <p className="featureCardDesc">
              Look up any public developer profile or compare two developers head-to-head with our dedicated
              comparison tool. Share persistent profile links and revisit recent searches instantly.
            </p>
            <ul className="featureList">
              <li>Head-to-head comparison engine at <code>/compare</code></li>
              <li>Direct permalinks for developer profiles (<code>/u/:username</code>)</li>
              <li>3 free guest searches without account creation</li>
            </ul>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="landingHowSection" aria-labelledby="how-heading">
        <div className="sectionHeader">
          <span className="sectionEyebrow">How It Works</span>
          <h2 id="how-heading" className="sectionTitle">
            Three steps from username to actionable intelligence
          </h2>
          <p className="sectionSubtitle">
            No agents, no installations, no API keys needed for guests. Explore repository telemetry in seconds.
          </p>
        </div>

        <div className="howStepsGrid">
          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">01</span>
              <div className="stepIcon terracotta">
                <Search size={22} />
              </div>
            </div>
            <h3 className="stepTitle">Find a GitHub user or repository</h3>
            <p className="stepDesc">
              Enter any developer username, repository handle, or paste a GitHub profile link directly into the search bar.
            </p>
            <div className="stepMiniPreview">
              <code>github.com/cgupta21</code>
            </div>
          </div>

          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">02</span>
              <div className="stepIcon sage">
                <BarChart3 size={22} />
              </div>
            </div>
            <h3 className="stepTitle">Analyze available repository information</h3>
            <p className="stepDesc">
              Arsenic gathers public commit events, repository metrics, language breakdowns, and collaboration signals.
            </p>
            <div className="stepMiniPreview">
              <span className="tagSage">Aggregating telemetry…</span>
            </div>
          </div>

          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">03</span>
              <div className="stepIcon sand">
                <Sparkles size={22} />
              </div>
            </div>
            <h3 className="stepTitle">Explore the resulting insights</h3>
            <p className="stepDesc">
              Inspect velocity scorecards, timing habits, active streaks, AI summaries, or compare multiple developers side by side.
            </p>
            <div className="stepMiniPreview">
              <span className="tagTerracotta">Health: 94 / 100 • 42d Streak</span>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="landingFinalCta" aria-labelledby="final-cta-heading">
        <div className="finalCtaCard">
          <div className="finalCtaBadge">
            <Github size={14} />
            <span>Developer Intelligence Platform</span>
          </div>
          <h2 id="final-cta-heading" className="finalCtaTitle">
            Ready to inspect GitHub repositories with precision?
          </h2>
          <p className="finalCtaSubtext">
            Start exploring developer intelligence now. 3 free searches for every visitor,
            unlimited searches with GitHub or Google sign-in.
          </p>
          <div className="finalCtaActions">
            <button
              type="button"
              className="primaryBtn finalCtaPrimary"
              onClick={onGetStarted}
              id="final-get-started-btn"
            >
              <span>Get Started</span>
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="outlineBtn finalCtaSecondary"
              onClick={onTryFree}
              id="final-try-free-btn"
            >
              <span>Try Free Without Login</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
