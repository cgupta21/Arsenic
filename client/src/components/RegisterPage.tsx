import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FolderGit2,
  Github,
  Lock,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

interface RegisterPageProps {
  onBackToHome: () => void
  onTryFree: () => void
  onOpenPrivacy: () => void
  onExistingSignIn: () => void
  sessionUser?: { login: string; name?: string | null; avatar_url?: string } | null
}

export function RegisterPage({
  onBackToHome,
  onTryFree,
  onOpenPrivacy,
  onExistingSignIn,
  sessionUser,
}: RegisterPageProps) {
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionUser) {
      window.history.pushState({}, '', '/dashboard')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [sessionUser])

  useEffect(() => {
    // Detect OAuth redirect errors (e.g. ?auth_error=google_denied)
    const params = new URLSearchParams(window.location.search)
    const err = params.get('auth_error')
    if (err) {
      if (err === 'google_denied') {
        setAuthError('Google sign-in was canceled or access was denied. You can try again, continue with GitHub, or explore free as a guest.')
      } else if (err.includes('not_configured') || err.includes('config')) {
        setAuthError('Google OAuth is not configured on this server. Please continue with GitHub or explore free as a guest.')
      } else {
        setAuthError(`Authentication was not completed (${err}). Please try signing in again or continue without login.`)
      }
    }
  }, [])

  return (
    <div className="registerPage">
      {/* Background ambient lighting */}
      <div className="landingAmbient">
        <div className="landingGlow1" aria-hidden="true" />
        <div className="landingGlow2" aria-hidden="true" />
      </div>

      <div className="registerContainer">
        <div className="registerCard">
          {/* Main Action Column */}
          <div className="registerMainCol">
            {/* Top Navigation / Brand */}
            <div className="registerNavHeader">
              <button
                type="button"
                className="registerBackLink"
                onClick={onBackToHome}
                aria-label="Return to Arsenic landing page"
              >
                <ArrowLeft size={16} />
                <span>Back to Arsenic</span>
              </button>

              <button
                type="button"
                className="brand brandButton"
                onClick={onBackToHome}
                aria-label="Arsenic home"
              >
                <img className="brandLogo" src="/assets/arsenic-logo.svg" alt="Arsenic" />
              </button>
            </div>

            {/* Error banner if redirected with OAuth error */}
            {authError && (
              <div className="authErrorBanner" role="alert">
                <AlertTriangle size={18} className="authErrorIcon" />
                <div className="authErrorText">
                  <strong>Authentication Notice</strong>
                  <p>{authError}</p>
                </div>
              </div>
            )}

            {/* Heading & Subtitle */}
            <div className="registerHeadingWrap">
              <h1 className="registerTitle">Start Exploring GitHub Intelligence</h1>
              <p className="registerSubtitle">
                Sign in with your preferred provider to unlock unlimited searches, higher GitHub API
                rate limits, and uninterrupted repository telemetry.
              </p>
            </div>

            {/* OAuth Buttons Group */}
            <div className="registerOAuthGroup">
              <a
                className="registerBtn continueWithGoogle"
                href="/auth/google"
                id="register-google-btn"
                title="Continue with Google"
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </a>

              <a
                className="registerBtn continueWithGithub"
                href="/auth/github"
                id="register-github-btn"
                title="Continue with GitHub"
              >
                <Github size={18} />
                <span>Continue with GitHub</span>
              </a>
            </div>

            {/* Clear Divider */}
            <div className="dividerOr" role="separator" aria-label="Alternative options">
              <span className="dividerLine" />
              <span className="dividerLabel">OR</span>
              <span className="dividerLine" />
            </div>

            {/* Prominent Try Free Button */}
            <div className="registerGuestOption">
              <button
                type="button"
                className="registerBtn tryFreeBtn"
                onClick={onTryFree}
                id="register-try-free-btn"
              >
                <Sparkles size={18} />
                <span>Try Free Without Login</span>
              </button>
              <p className="guestAllowanceNote">
                <CheckCircle2 size={13} />
                <span>3 free guest searches included • No credit card or account needed</span>
              </p>
            </div>

            {/* Existing User & Privacy Links */}
            <div className="registerFooterLinks">
              <p className="existingUserPrompt">
                Already have an account?{' '}
                <button
                  type="button"
                  className="existingSignInLink"
                  onClick={onExistingSignIn}
                >
                  Sign In
                </button>
              </p>

              <button
                type="button"
                className="privacyNoteTrigger"
                onClick={onOpenPrivacy}
              >
                <ShieldCheck size={14} />
                <span>Zero write permissions • Read-only OAuth privacy policy</span>
              </button>
            </div>
          </div>

          {/* Right Info Column (Desktop / Tablet) */}
          <div className="registerInfoCol">
            <div className="registerInfoGlow" aria-hidden="true" />

            <div className="registerInfoContent">
              <div className="infoMiniBadge">
                <Sparkles size={14} />
                <span>Developer Tier Access</span>
              </div>

              <h2 className="infoTitle">Everything you need to evaluate codebase health.</h2>
              <p className="infoDesc">
                Connect your GitHub or Google identity to explore developer contributions and repository metrics without search limits.
              </p>

              <div className="infoPerksList">
                <div className="infoPerkItem">
                  <div className="perkIcon terracotta">
                    <Zap size={16} />
                  </div>
                  <div className="perkText">
                    <h4>Unlimited Searches</h4>
                    <p>Analyze as many profiles, repositories, and organizations as you need without hitting guest search caps.</p>
                  </div>
                </div>

                <div className="infoPerkItem">
                  <div className="perkIcon sage">
                    <FolderGit2 size={16} />
                  </div>
                  <div className="perkText">
                    <h4>5,000 Requests/Hour API Quota</h4>
                    <p>GitHub grants authenticated requests a 5,000 req/hr rate limit pool, versus 60 req/hr for anonymous guests.</p>
                  </div>
                </div>

                <div className="infoPerkItem">
                  <div className="perkIcon sand">
                    <Search size={16} />
                  </div>
                  <div className="perkText">
                    <h4>Head-to-Head Compare</h4>
                    <p>Benchmark two developers or contributors side-by-side across streaks, commit cadence, and health scores.</p>
                  </div>
                </div>

                <div className="infoPerkItem">
                  <div className="perkIcon terracotta">
                    <Lock size={16} />
                  </div>
                  <div className="perkText">
                    <h4>Strictly Read-Only</h4>
                    <p>Arsenic never requests write or admin access to your repositories. Sessions are sealed in encrypted cookies.</p>
                  </div>
                </div>
              </div>

              <div className="infoShowcaseFooter">
                <div className="infoShowcaseAvatars" aria-hidden="true">
                  <span className="avatarChip">C</span>
                  <span className="avatarChip alt">T</span>
                  <span className="avatarChip alt2">O</span>
                </div>
                <span className="infoShowcaseText">
                  Ready to inspect any repository with genuine GitHub signals.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
