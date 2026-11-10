import { useState, type FormEvent } from 'react'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  Github,
  Search,
  Shield,
  Terminal,
  TrendingUp,
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
      {/* Hero Section */}
      <section className="landingHero" aria-labelledby="hero-heading">
        <div className="landingHeroContent">
          <div className="landingBadge">
            <span className="landingBadgeDot" />
            <span className="landingBadgeTag">Arsenic v2.0</span>
            <span className="landingBadgeText">GitHub Developer Intelligence</span>
          </div>

          <h1 id="hero-heading" className="landingHeadline">
            Analyze GitHub developer profiles and <span className="brandAccent">engineering cadence</span>
          </h1>

          <p className="landingSubcopy">
            Inspect commit frequency, repository portfolio health, contribution velocity, and collaboration patterns from public GitHub activity.
          </p>

          <div className="landingCtaGroup">
            <button
              type="button"
              className="primaryBtn landingCtaPrimary"
              onClick={onGetStarted}
              id="hero-get-started-btn"
            >
              <span>Get started</span>
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="outlineBtn landingCtaSecondary"
              onClick={onTryFree}
              id="hero-try-free-btn"
            >
              <Terminal size={16} />
              <span>Explore as guest</span>
            </button>
          </div>

          {/* Quick Search Bar directly in Hero */}
          <form className="landingQuickSearch" onSubmit={handleHeroSubmit} role="search" aria-label="Developer profile search">
            <div className="landingSearchInputWrap">
              <label htmlFor="landing-search-input" className="srOnly">
                GitHub username or profile URL
              </label>
              <Search size={18} className="landingSearchIcon" aria-hidden="true" />
              <input
                id="landing-search-input"
                type="text"
                value={heroSearchInput}
                onChange={(e) => {
                  setHeroSearchInput(e.target.value)
                  if (heroSearchError) setHeroSearchError(null)
                }}
                placeholder="GitHub username or profile URL (e.g. cgupta21 or torvalds)"
                aria-label="GitHub username or profile URL"
                className="landingSearchInput"
              />
              <button type="submit" className="landingSearchSubmitBtn">
                Inspect
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
              <div className="previewCardTitle">
                <Github size={15} />
                <span>@cgupta21</span>
                <span className="previewStatusBadge">Developer Profile • Active</span>
              </div>
              <div className="previewLivePill">
                <span>Sample analysis</span>
              </div>
            </div>

            <div className="previewCardBody">
              {/* Top Score Strip */}
              <div className="previewScoreStrip">
                <div className="previewScoreMain">
                  <div className="previewScoreValue">62</div>
                  <div className="previewScoreMeta">
                    <div className="scoreGrade">Recorded Contribution Days</div>
                    <div className="scoreSubtext">Activity • Adoption • Reach • Maintenance • Community Engagement</div>
                  </div>
                </div>
                <div className="previewScoreTags">
                  <span className="previewTag tagSage">
                    <CheckCircle2 size={12} /> Consistent commits
                  </span>
                  <span className="previewTag tagSand">
                    <GitBranch size={12} /> Regular PR reviews
                  </span>
                </div>
              </div>

              {/* Metric Cards Row */}
              <div className="previewMetricsGrid">
                <div className="previewMetricItem">
                  <span className="metricLabel">Total contributions</span>
                  <span className="metricVal">1,842</span>
                  <span className="metricTrend positive">457 PRs & commits</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">Active streak</span>
                  <span className="metricVal">42 days</span>
                  <span className="metricTrend">Longest: 68 days</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">Active days</span>
                  <span className="metricVal">284 / 365</span>
                  <span className="metricTrend positive">78% consistency</span>
                </div>
                <div className="previewMetricItem">
                  <span className="metricLabel">Tracked repositories</span>
                  <span className="metricVal">24 repos</span>
                  <span className="metricTrend">84 stars earned</span>
                </div>
              </div>

              {/* Visual Heatmap Mockup */}
              <div className="previewHeatmapSection">
                <div className="previewSectionLabel">
                  <span>Contribution timing & density</span>
                  <span className="heatmapLegendNote">Last 16 weeks</span>
                </div>
                <div className="previewHeatmapGrid" aria-hidden="true">
                  {[
                    1, 2, 3, 0, 2, 3, 2, 1, 3, 4, 2, 0, 1, 2, 3, 2,
                    2, 3, 1, 0, 3, 2, 4, 1, 2, 3, 3, 0, 1, 2, 2, 1,
                    3, 4, 3, 0, 2, 3, 2, 1, 1, 2, 4, 0, 3, 3, 2, 1,
                    2, 3, 1, 0, 2, 4, 3, 1, 3, 2, 2, 0, 1, 3, 2, 1
                  ].map((lvl, i) => (
                    <div key={i} className={`heatmapCell lvl-${lvl}`} />
                  ))}
                </div>
              </div>

              {/* Language Distribution & Architecture Takeaway */}
              <div className="previewSummaryRow">
                <div className="previewLangBar">
                  <div className="langSegment ts" style={{ width: '58%' }} title="TypeScript 58%" />
                  <div className="langSegment css" style={{ width: '22%' }} title="CSS 22%" />
                  <div className="langSegment js" style={{ width: '14%' }} title="JavaScript 14%" />
                  <div className="langSegment html" style={{ width: '6%' }} title="HTML 6%" />
                </div>
                <div className="previewLangLegend">
                  <span className="langLegendItem"><span className="langDot ts" /> TypeScript (58%)</span>
                  <span className="langLegendItem"><span className="langDot css" /> CSS (22%)</span>
                  <span className="langLegendItem"><span className="langDot js" /> JavaScript (14%)</span>
                  <span className="langLegendItem"><span className="langDot html" /> HTML (6%)</span>
                </div>
              </div>
            </div>

            <div className="previewCardFooter">
              <span className="previewCaption">
                Sample analysis based on public developer metrics for @cgupta21
              </span>
              <button
                type="button"
                className="previewExploreBtn"
                onClick={() => onSearch('cgupta21')}
              >
                Inspect live dashboard →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Pillars Strip */}
      <section className="landingPillars" aria-label="Key Capabilities">
        <div className="pillarItem">
          <div className="pillarIcon">
            <Terminal size={18} />
          </div>
          <div className="pillarText">
            <h3>Fast lookup</h3>
            <p>Inspect any public GitHub developer by username or profile URL without configuration.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon">
            <BarChart3 size={18} />
          </div>
          <div className="pillarText">
            <h3>Contribution timing</h3>
            <p>Track day-of-week and hourly commit frequency to understand development patterns.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon">
            <TrendingUp size={18} />
          </div>
          <div className="pillarText">
            <h3>Portfolio health</h3>
            <p>Intelligence across activity, adoption, reach, maintenance, and community engagement.</p>
          </div>
        </div>
        <div className="pillarItem">
          <div className="pillarIcon">
            <Shield size={18} />
          </div>
          <div className="pillarText">
            <h3>Read-only access</h3>
            <p>Read-only OAuth scopes. Ephemeral sessions without database persistence.</p>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section id="features" className="landingFeaturesSection" aria-labelledby="features-heading">
        <div className="sectionHeader">
          <span className="sectionEyebrow">Features</span>
          <h2 id="features-heading" className="sectionTitle">
            Evaluate developer profiles and repository portfolios
          </h2>
          <p className="sectionSubtitle">
            Arsenic surfaces developer velocity, collaboration habits, and repository portfolio health directly
            from verified GitHub activity data.
          </p>
        </div>

        <div className="featuresGrid">
          {/* Card 1: Repository Intelligence */}
          <div className="featureCard">
            <div className="featureCardIcon">
              <FolderGit2 size={20} />
            </div>
            <h3 className="featureCardTitle">Repository metrics</h3>
            <p className="featureCardDesc">
              Inspect repository status, star counts, primary languages, and maintenance cadence across a
              developer&apos;s public repository portfolio.
            </p>
            <ul className="featureList">
              <li>Portfolio repository status and issue ratios</li>
              <li>Star and fork counts across public projects</li>
              <li>Stale vs active repository tagging</li>
            </ul>
          </div>

          {/* Card 2: Developer Activity Insights */}
          <div className="featureCard">
            <div className="featureCardIcon">
              <TrendingUp size={20} />
            </div>
            <h3 className="featureCardTitle">Activity insights</h3>
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
            <div className="featureCardIcon">
              <BarChart3 size={20} />
            </div>
            <h3 className="featureCardTitle">Contribution analysis</h3>
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
            <div className="featureCardIcon">
              <Activity size={20} />
            </div>
            <h3 className="featureCardTitle">Summaries</h3>
            <p className="featureCardDesc">
              Generate structured analytical takeaways and engineering highlights for any public
              developer profile on demand using verified event signals.
            </p>
            <ul className="featureList">
              <li>Instant engineering takeaway generation</li>
              <li>Deterministic synthesis from genuine signals</li>
              <li>One-click copy and export capabilities</li>
            </ul>
          </div>

          {/* Card 5: Search and Explore */}
          <div className="featureCard featureCardSpan">
            <div className="featureCardMain">
              <div className="featureCardIcon">
                <Search size={20} />
              </div>
              <h3 className="featureCardTitle">Search and compare</h3>
              <p className="featureCardDesc">
                Look up any public developer profile or compare two developers head-to-head with our dedicated
                comparison tool. Share persistent profile links and revisit recent searches instantly.
              </p>
            </div>
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
            Three steps to inspect any developer profile
          </h2>
          <p className="sectionSubtitle">
            No agents or installations needed. Enter any public GitHub username or profile URL to inspect developer activity.
          </p>
        </div>

        <div className="howStepsGrid">
          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">01</span>
              <div className="stepIcon">
                <Search size={18} />
              </div>
            </div>
            <h3 className="stepTitle">Find a public GitHub developer</h3>
            <p className="stepDesc">
              Enter any developer username or paste a GitHub profile link directly into the search bar.
            </p>
            <div className="stepMiniPreview">
              <code>github.com/cgupta21</code>
            </div>
          </div>

          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">02</span>
              <div className="stepIcon">
                <BarChart3 size={18} />
              </div>
            </div>
            <h3 className="stepTitle">Aggregate developer telemetry</h3>
            <p className="stepDesc">
              Arsenic gathers public commit events, repository portfolio metrics, language breakdowns, and collaboration signals.
            </p>
            <div className="stepMiniPreview">
              <span className="tagSage">Aggregating telemetry…</span>
            </div>
          </div>

          <div className="stepCard">
            <div className="stepHeader">
              <span className="stepNumber">03</span>
              <div className="stepIcon">
                <Activity size={18} />
              </div>
            </div>
            <h3 className="stepTitle">Explore developer insights</h3>
            <p className="stepDesc">
              Inspect activity cadence, timing habits, active streaks, automated summaries, or compare multiple developers side-by-side.
            </p>
            <div className="stepMiniPreview">
              <span className="tagTerracotta">62 Active Days • 42d Streak</span>
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
            Analyze GitHub developer profiles and contribution patterns
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
              <span>Get started</span>
              <ArrowRight size={17} />
            </button>
            <button
              type="button"
              className="outlineBtn finalCtaSecondary"
              onClick={onTryFree}
              id="final-try-free-btn"
            >
              <span>Explore as guest</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
