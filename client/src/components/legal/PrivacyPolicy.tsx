import { ArrowLeft, ShieldCheck, Mail, Lock, Server, Database } from 'lucide-react'

interface LegalPageProps {
  onBackToHome: () => void
  onNavigateTo: (route: string) => void
}

export function PrivacyPolicy({ onBackToHome, onNavigateTo }: LegalPageProps) {
  return (
    <div className="legalPage">
      <div className="legalContainer">
        <div className="legalHeaderNav">
          <button
            type="button"
            className="legalBackBtn"
            onClick={onBackToHome}
            aria-label="Return to Arsenic home"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Back to Arsenic</span>
          </button>
          <div className="legalNavLinks">
            <button
              type="button"
              className="legalNavPill active"
              onClick={() => onNavigateTo('/privacy')}
              aria-current="page"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              className="legalNavPill"
              onClick={() => onNavigateTo('/terms')}
            >
              Terms of Service
            </button>
            <button
              type="button"
              className="legalNavPill"
              onClick={() => onNavigateTo('/cookies')}
            >
              Cookie Policy
            </button>
          </div>
        </div>

        <article className="legalContent" aria-labelledby="privacy-heading">
          <header className="legalTitleBlock">
            <div className="legalBadge">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Transparency &amp; Data Protection</span>
            </div>
            <h1 id="privacy-heading" className="legalTitle">Privacy Policy</h1>
            <p className="legalMeta">
              <strong>Effective Date:</strong> November 8, 2026 &bull; <strong>Last Updated:</strong> November 8, 2026
            </p>
          </header>

          <section className="legalSection">
            <h2>1. Operator &amp; Contact Information</h2>
            <p>
              Arsenic (accessible at <a href="https://arsenic-rho.vercel.app">https://arsenic-rho.vercel.app</a>) is an independent, free developer analytics and repository intelligence tool.
            </p>
            <p>
              <strong>Operator:</strong> Individual developer based in India. Arsenic is not a registered corporate entity or business.
            </p>
            <p>
              <strong>Official Contact Email:</strong>{' '}
              <a href="mailto:arsenic.helpdesk@gmail.com" className="legalEmailLink">
                arsenic.helpdesk@gmail.com
              </a>
            </p>
            <p>
              For all privacy inquiries, data clarification requests, or feedback, please write to our official contact email. We aim to acknowledge and address legitimate requests within reasonable operational timeframes.
            </p>
          </section>

          <section className="legalSection">
            <h2>2. Core Architectural Privacy Principles</h2>
            <div className="legalCallout">
              <div className="calloutIcon"><Database size={20} aria-hidden="true" /></div>
              <div className="calloutBody">
                <strong>No Application Database</strong>
                <p>
                  Arsenic operates without a database (no PostgreSQL, MongoDB, MySQL, or persistent user database). We do not store developer profiles, user accounts, or query logs in a persistent database.
                </p>
              </div>
            </div>
            <div className="legalCallout">
              <div className="calloutIcon"><Server size={20} aria-hidden="true" /></div>
              <div className="calloutBody">
                <strong>Deterministic, Local Computation (No External AI)</strong>
                <p>
                  Developer summaries and health scorecards are generated on-the-fly using deterministic algorithmic rules implemented directly within our own application codebase. We do not transmit profile data to external artificial intelligence (AI) providers, third-party Large Language Models (LLMs), or external machine-learning APIs. All summary synthesis executes locally in our Node.js runtime without transmitting user queries or code telemetry to any third party.
                </p>
              </div>
            </div>
            <div className="legalCallout">
              <div className="calloutIcon"><Lock size={20} aria-hidden="true" /></div>
              <div className="calloutBody">
                <strong>Zero Commercial Tracking</strong>
                <p>
                  Arsenic does not install advertising trackers, marketing pixels, behavioral analytics suites (such as Google Analytics or Meta Pixel), or session-replay scripts.
                </p>
              </div>
            </div>
          </section>

          <section className="legalSection">
            <h2>3. Information We Process</h2>
            <p>We process information only to the extent necessary to provide developer analytics:</p>

            <h3>A. Information Submitted by You</h3>
            <ul>
              <li>
                <strong>Search Queries:</strong> When you enter a public GitHub username or repository handle, that identifier is used to request public information from the GitHub REST and GraphQL APIs. Search inputs are not saved to a server database.
              </li>
              <li>
                <strong>Local Search History:</strong> For your convenience, your last 8 searched handles are saved locally on your device in your browser&apos;s <code>localStorage</code> (key: <code>arsenic-recent-searches</code>). This data stays on your personal device and is never sent automatically to our servers.
              </li>
            </ul>

            <h3>B. Public GitHub Data Retrieved via API</h3>
            <p>
              When a profile or repository is analyzed, Arsenic queries GitHub&apos;s public APIs on your behalf to retrieve:
            </p>
            <ul>
              <li>Public profile information (username, display name, public bio, public email if shared, avatar URL, follower counts).</li>
              <li>Public repository telemetry (names, descriptions, primary languages, commit frequency, star counts, fork counts, open issues).</li>
              <li>Public contribution calendar metrics (commit counts, PRs, issue participation).</li>
            </ul>
            <p>
              This information is already public on GitHub. We process it temporarily in server memory to calculate cadence metrics and render charts. Public repository and profile telemetry is cached in server RAM for up to 10 minutes, and generated summary text is cached for up to 1 hour, to respect GitHub API rate limits and avoid redundant computation. Developer summaries are generated entirely on-server via local deterministic heuristic scoring without sending any data to external AI services; no third party receives input data or metrics during summary generation.
            </p>

            <h3>C. Authentication &amp; OAuth Data</h3>
            <p>
              Signing in is completely optional. Visitors can use the application as a guest without creating an account or logging in. If you choose to authenticate:
            </p>
            <ul>
              <li>
                <strong>GitHub OAuth:</strong> We request a minimal read-only scope (<code>read:user</code>). We do not request repository permissions (no <code>repo</code> scope), do not request private email access (no <code>user:email</code> scope), and request zero write permissions. From GitHub&apos;s authorization response, we receive public profile details (username, display name, avatar URL) and a temporary OAuth access token. The token is stored exclusively inside the client&apos;s encrypted, signed HTTP session cookie on your browser; we do not persist a numeric user ID or email record on our servers. The token is used solely to query GitHub with an elevated rate limit (5,000 requests/hour) and to permit GitHub to return aggregate private/internal contribution counts for personal self-analysis when enabled in your GitHub profile settings. Private contribution counts are not guaranteed if disabled in your GitHub account. Arsenic never accesses private repository names, source code, commits, issues, pull requests, or other private repository contents. It is never used to query data on behalf of other users.
              </li>
              <li>
                <strong>Google OAuth:</strong> We request basic identity scopes (<code>openid, email, profile</code>). We verify your Google identity token and extract your email address, display name, and avatar picture to store in your sealed session cookie. We do not store Google access tokens or OAuth refresh tokens on our servers. This authentication enables you to bypass the unauthenticated guest search limit without granting GitHub account permissions.
              </li>
            </ul>

            <h3>D. Technical &amp; Operational Metadata</h3>
            <p>
              Like any web application, incoming HTTP requests convey standard technical headers:
            </p>
            <ul>
              <li><strong>IP Addresses:</strong> Used in server memory to enforce reasonable rate limits (e.g. 90 requests/minute for general routes; unauthenticated guest search caps) and mitigate denial-of-service abuse. IP addresses are not stored in an application database.</li>
              <li><strong>Origin &amp; Referer Headers:</strong> Checked by our backend to enforce Cross-Origin Resource Sharing (CORS) and Cross-Site Request Forgery (CSRF) defenses.</li>
              <li><strong>Infrastructure Logs:</strong> Hosting and edge routing is provided by Vercel Inc., which automatically processes request headers and serverless function logs according to its standard infrastructure operations and security practices.</li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>4. Essential Cookies &amp; Browser Storage</h2>
            <p>
              Arsenic uses only two strictly essential first-party cookies necessary for authentication and security. We do not use optional marketing, advertising, or tracking cookies:
            </p>
            <div className="legalTableWrapper">
              <table className="legalTable">
                <thead>
                  <tr>
                    <th scope="col">Cookie Name</th>
                    <th scope="col">Classification</th>
                    <th scope="col">Lifespan</th>
                    <th scope="col">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>session</code></td>
                    <td>Strictly Essential</td>
                    <td>7 days</td>
                    <td>
                      Stores an encrypted, sealed session payload (using <code>iron-session</code>). For authenticated users: holds identity state (<code>githubUser</code> / <code>googleUser</code>) and temporary GitHub OAuth access token. For unauthenticated guests: holds the guest search count (<code>guestSearches</code>) and list of up to 3 searched profiles (<code>searchedProfiles</code>) to enforce search quotas. Protected by <code>HttpOnly</code>, <code>SameSite=Lax</code>, and <code>Secure</code> flags.
                    </td>
                  </tr>
                  <tr>
                    <td><code>oauth_state</code></td>
                    <td>Strictly Essential</td>
                    <td>10 minutes</td>
                    <td>
                      Holds a cryptographically signed HMAC nonce during OAuth login handshakes to prevent Cross-Site Request Forgery (CSRF). Cleared immediately once authentication completes.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              For further details on cookie attributes and browser settings, please see our dedicated{' '}
              <button type="button" className="inlineLegalLink" onClick={() => onNavigateTo('/cookies')}>
                Cookie Policy
              </button>.
            </p>
          </section>

          <section className="legalSection">
            <h2>5. Third-Party Service Providers</h2>
            <p>
              Arsenic interacts with the following external services to deliver its capabilities:
            </p>
            <ul>
              <li>
                <strong>GitHub, Inc. (Microsoft):</strong> Provides the upstream public APIs and optional GitHub OAuth authentication. Your use of GitHub data remains subject to <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub&apos;s Privacy Statement</a>.
              </li>
              <li>
                <strong>Google LLC:</strong> Provides optional Google OAuth identity sign-in. Subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&apos;s Privacy Policy</a>.
              </li>
              <li>
                <strong>Vercel Inc.:</strong> Hosts our production frontend, static assets, and backend serverless endpoints. Subject to <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Vercel&apos;s Privacy Policy</a>.
              </li>
              <li>
                <strong>Avatar Image CDNs:</strong> Developer profile pictures are loaded by your browser directly from GitHub (<code>avatars.githubusercontent.com</code>) and Google (<code>lh3.googleusercontent.com</code>).
              </li>
            </ul>
            <p>
              Arsenic does not sell, rent, monetize, or trade user information with data brokers or advertising networks.
            </p>
          </section>

          <section className="legalSection">
            <h2>6. Data Retention, Logout &amp; Deletion</h2>
            <p>
              We maintain transparency regarding what data is affected upon logout versus what remains subject to client-side or third-party storage:
            </p>
            <ul>
              <li>
                <strong>Stateless Session Cookie Expiration:</strong> Arsenic utilizes <code>iron-session</code> statelessly without a database or centralized server-side session store. All active session state (including authenticated identifiers and temporary OAuth access tokens) is sealed exclusively inside the client&apos;s encrypted browser cookie. Clicking &quot;Sign out&quot; sends a POST request to <code>/auth/logout</code>, clearing the in-memory request reference and setting an expired <code>Set-Cookie</code> header (<code>Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT</code>) instructing your browser to delete the cookie from device storage.
              </li>
              <li>
                <strong>Scope of Logout:</strong> Expiring the session cookie prevents your browser from sending the sealed session payload on future requests. Logout does <em>not</em> erase copies or information outside Arsenic&apos;s control, such as client-side browser storage (<code>localStorage</code>), third-party identity provider account records (GitHub, Google), or hosting-provider infrastructure records (Vercel).
              </li>
              <li>
                <strong>Local Search History (Client-Side Storage):</strong> Logging out does <em>not</em> clear your client-side search history (stored under the key <code>arsenic-recent-searches</code> in your browser&apos;s <code>localStorage</code>). To clear this history, you can manually delete site data or local storage through your browser&apos;s privacy settings (e.g. <em>Settings &rarr; Privacy and security &rarr; Clear browsing data</em>).
              </li>
              <li>
                <strong>Third-Party Platform Retention &amp; Revocation:</strong> Arsenic cannot independently delete records maintained by external platforms. You can permanently revoke Arsenic&apos;s API access directly within your third-party account settings:
                <ul>
                  <li>For GitHub: Visit <em>GitHub Settings &rarr; Applications &rarr; Authorized OAuth Apps</em> and revoke Arsenic.</li>
                  <li>For Google: Visit <em>Google Account Security &rarr; Third-party apps with account access</em> and remove Arsenic.</li>
                </ul>
              </li>
              <li>
                <strong>Hosting Infrastructure Logs:</strong> Hosting and edge routing for Arsenic is operated by Vercel Inc. HTTP request headers, IP routing telemetry, and edge execution logs are processed and retained in accordance with Vercel&apos;s independent infrastructure security and operations policies. Arsenic does not operate a persistent database and cannot modify or purge upstream Vercel platform logs.
              </li>
              <li>
                <strong>Server RAM Cache:</strong> All temporary GitHub profile and repository telemetry held in server RAM cache automatically expires within 10 minutes, while generated summary text in memory cache expires within 1 hour. Because we operate zero persistent application databases, no long-term user profile records or search dossiers are retained on our servers.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>7. Security Safeguards</h2>
            <p>We implement industry-standard technical measures to safeguard information in transit and during active sessions:</p>
            <ul>
              <li>Strict Transport Security (HSTS) and enforced HTTPS encryption.</li>
              <li>Robust Content Security Policy (CSP), anti-clickjacking frame controls (<code>X-Frame-Options: SAMEORIGIN</code>), and MIME-sniffing protection (<code>X-Content-Type-Options: nosniff</code>) via Helmet.</li>
              <li>Encrypted, tamper-evident session cookies sealed with authenticated encryption and cryptographic integrity protection via <code>iron-session</code>.</li>
              <li>Cryptographic HMAC-signed OAuth state validation to prevent cross-site request forgery.</li>
              <li>Origin and Referer validation on all state-modifying POST routes.</li>
              <li>Rate limiting to prevent abuse and brute-force traffic.</li>
            </ul>
            <p>
              Please note that no internet transmission or electronic storage method is completely invulnerable. While we employ rigorous engineering controls, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="legalSection">
            <h2>8. Indian Legal Framework &amp; International Standards</h2>
            <p>
              Arsenic is developed and operated from India by an individual developer. We align our data handling practices with applicable Indian legal standards:
            </p>
            <ul>
              <li>
                <strong>Digital Personal Data Protection Act, 2023 (DPDP Act) &amp; DPDP Rules, 2025:</strong> To the extent the operator determines the purposes and means of processing personal data in connection with the Service, the operator may be characterized as a Data Fiduciary under the DPDP Act. We observe the statutory phased commencement timeline established by official Ministry of Electronics and Information Technology (MeitY) Gazette notifications (specifically G.S.R. 843(E) for the Act and G.S.R. 846(E) for the Rules):
                <ul>
                  <li><strong>13 November 2025:</strong> Foundational provisions took effect, enforcing Section 1(2), Section 2 (definitions), Sections 18 through 26 (constitution, terms, and proceedings of the Data Protection Board of India), Section 35, Sections 38 through 43 (rulemaking powers, good faith protections, and bar of civil court jurisdiction), Section 44(1) and (3), and DPDP Rules 1, 2, and 17 through 21 (Board procedure and Search-cum-Selection Committee).</li>
                  <li><strong>13 November 2026:</strong> Specialized provisions—specifically Section 6(9) regarding registration and obligations of Consent Managers, Section 27(1)(d) regarding interim orders, and DPDP Rule 4 (Consent Manager registration criteria)—are scheduled for commencement.</li>
                  <li><strong>13 May 2027:</strong> The primary substantive Data Fiduciary obligations and Data Principal rights (specifically Sections 3 through 17, governing the grounds for processing, notice requirements, Data Fiduciary duties, rights to access/correction/erasure, and children&apos;s data restrictions), statutory inquiry and penalty powers under Sections 28 through 34, and substantive implementation rules under DPDP Rules 3, 5 through 16, 22, and 23 (including security safeguards, breach reporting timelines, and grievance redressal) are scheduled to take effect.</li>
                </ul>
                Arsenic has not received any formal designation as a Significant Data Fiduciary (SDF) under Section 10, nor does an ordinary Data Fiduciary require formal government registration. We proactively practice core privacy-by-design, data minimization, and purpose limitation standards.
              </li>
              <li>
                <strong>Information Technology Act, 2000 &amp; Intermediary Rules:</strong> Arsenic is a non-monetized utility interface providing automated analysis of public GitHub API data, rather than a platform hosting or transmitting third-party user-generated content. We adhere to reasonable security standards under the IT Act. Statutory Grievance Officer requirements under Rule 3(2) of the IT Intermediary Guidelines are not assumed to be statutorily mandated for this utility, but we provide our official helpdesk email as a voluntary support and privacy contact point.
              </li>
              <li>
                <strong>International Access (GDPR &amp; CCPA/CPRA Preliminary Assessments):</strong> Arsenic is accessible globally over the internet without geographical access blocks. Under GDPR Article 3(2)(a), offering a service—irrespective of whether payment is required—to individuals in the European Union may bring processing within scope of the GDPR. Similarly, California privacy legislation (CCPA/CPRA) regulates the collection and processing of personal information. The fact that Arsenic is a free service operated by an individual does not by itself establish a definitive legal exemption from CCPA or GDPR. However, Arsenic does not monetize personal data, does not sell or share personal information, does not engage in cross-context behavioral advertising, and does not operate persistent user databases. These statements represent preliminary operational assessments rather than definitive statutory exemptions or certifications, and remain subject to qualified legal review. We uphold data minimization, purpose limitation, and user transparency across all interactions regardless of user location.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>9. Changes to this Policy</h2>
            <p>
              We may update this Privacy Policy from time to time to reflect technological improvements, legal requirements, or architectural changes. Any updates will be published on this page with an updated &quot;Last Updated&quot; date.
            </p>
          </section>

          <section className="legalSection">
            <h2>10. Inquiries &amp; Voluntary Support Contact</h2>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or our data practices, please reach out to our voluntary support contact:
            </p>
            <div className="contactCard">
              <Mail size={18} aria-hidden="true" />
              <div>
                <strong>Support &amp; Privacy Contact</strong>
                <p>
                  <a href="mailto:arsenic.helpdesk@gmail.com">arsenic.helpdesk@gmail.com</a>
                </p>
                <span className="contactSub">Operated by an individual developer &bull; India</span>
              </div>
            </div>
          </section>
        </article>
      </div>
    </div>
  )
}
