import { ArrowLeft, Cookie, Mail, CheckCircle2 } from 'lucide-react'

interface LegalPageProps {
  onBackToHome: () => void
  onNavigateTo: (route: string) => void
}

export function CookiePolicy({ onBackToHome, onNavigateTo }: LegalPageProps) {
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
              className="legalNavPill"
              onClick={() => onNavigateTo('/privacy')}
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
              className="legalNavPill active"
              onClick={() => onNavigateTo('/cookies')}
              aria-current="page"
            >
              Cookie Policy
            </button>
          </div>
        </div>

        <article className="legalContent" aria-labelledby="cookies-heading">
          <header className="legalTitleBlock">
            <div className="legalBadge">
              <Cookie size={16} aria-hidden="true" />
              <span>Cookies &amp; Local Storage</span>
            </div>
            <h1 id="cookies-heading" className="legalTitle">Cookie Policy</h1>
            <p className="legalMeta">
              <strong>Effective Date:</strong> November 8, 2026 &bull; <strong>Last Updated:</strong> November 8, 2026
            </p>
          </header>

          <section className="legalSection">
            <h2>1. What Are Cookies?</h2>
            <p>
              Cookies are small data files placed on your computer or mobile device by websites you visit. They are widely used to make web applications function correctly, maintain security, and preserve user session state across page requests.
            </p>
            <p>
              This Cookie Policy explains how <strong>Arsenic</strong> uses cookies and local browser storage, and why our practices protect your privacy.
            </p>
          </section>

          <section className="legalSection">
            <h2>2. Our Zero-Tracking Guarantee</h2>
            <div className="legalCallout">
              <div className="calloutIcon"><CheckCircle2 size={20} aria-hidden="true" /></div>
              <div className="calloutBody">
                <strong>No Advertising, Marketing, or Third-Party Analytics Cookies</strong>
                <p>
                  Arsenic does <strong>not</strong> install third-party advertising trackers, marketing pixels, social tracking widgets, or analytics cookies (such as Google Analytics, Meta Pixel, or similar tracking suites). We only use first-party cookies that are strictly necessary for core authentication and security.
                </p>
              </div>
            </div>
          </section>

          <section className="legalSection">
            <h2>3. Complete Inventory of Cookies Used</h2>
            <p>
              Arsenic sets only two first-party cookies, both of which are strictly necessary for the application to function when you choose to log in:
            </p>

            <div className="legalTableWrapper">
              <table className="legalTable">
                <thead>
                  <tr>
                    <th scope="col">Cookie Name</th>
                    <th scope="col">Classification</th>
                    <th scope="col">Type &amp; Domain</th>
                    <th scope="col">Lifespan</th>
                    <th scope="col">Purpose &amp; Technical Attributes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>session</code></td>
                    <td>Strictly Essential</td>
                    <td>First-Party (Arsenic)</td>
                    <td>7 days</td>
                    <td>
                      <p>
                        <strong>Authentication State &amp; Guest Quota:</strong> Stores an encrypted, integrity-protected session payload sealed via <code>iron-session</code>. For authenticated users, it holds verified user identity state and the temporary GitHub OAuth access token. For unauthenticated visitors, it holds the count of free searches performed (<code>guestSearches</code>) and up to 3 searched developer handles (<code>searchedProfiles</code>) to enforce guest search quotas.
                      </p>
                      <p>
                        <strong>Security Flags:</strong> <code>HttpOnly</code> (inaccessible to client JavaScript to mitigate XSS attacks), <code>SameSite=Lax</code> (prevents CSRF token leaks), <code>Secure</code> in production environments (ensures transmission exclusively over encrypted HTTPS connections), and <code>Path=/</code>.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td><code>oauth_state</code></td>
                    <td>Strictly Essential</td>
                    <td>First-Party (Arsenic)</td>
                    <td>10 minutes (or until login completes)</td>
                    <td>
                      <p>
                        <strong>OAuth CSRF Protection:</strong> A short-lived, cryptographically signed HMAC nonce set during GitHub and Google OAuth handshakes to ensure that authentication responses originate from your deliberate login request.
                      </p>
                      <p>
                        <strong>Security Flags:</strong> <code>HttpOnly</code>, <code>SameSite=Lax</code>, <code>Secure</code> in production, and <code>Path=/</code>. Cleared immediately once the OAuth callback is verified.
                      </p>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="legalSection">
            <h2>4. Browser Local Storage (localStorage)</h2>
            <p>
              In addition to cookies, modern web browsers offer <strong>Web Storage (localStorage)</strong>. Note that localStorage is client-side storage, NOT an HTTP cookie: it is stored directly on your personal device and is not included automatically in HTTP network requests to our server.
            </p>
            <div className="legalTableWrapper">
              <table className="legalTable">
                <thead>
                  <tr>
                    <th scope="col">Storage Key</th>
                    <th scope="col">Storage Mechanism</th>
                    <th scope="col">Duration</th>
                    <th scope="col">Description &amp; User Control</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><code>arsenic-recent-searches</code></td>
                    <td><code>window.localStorage</code></td>
                    <td>Persistent on device until cleared</td>
                    <td>
                      Stores the list of up to 8 recently searched developer handles (e.g. <code>cgupta21</code>, <code>torvalds</code>) so you can quickly revisit them. This data remains 100% on your local device and is never uploaded automatically to our servers. You can clear it at any time by clearing your browser cache or site data.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Arsenic does <strong>not</strong> use <code>sessionStorage</code> or <code>IndexedDB</code>.
            </p>
          </section>

          <section className="legalSection">
            <h2>5. Legal Basis for Strictly Necessary Cookies &amp; Consent Frameworks</h2>
            <p>
              Different legal jurisdictions maintain distinct rules governing cookies and device storage. We clearly separate cookie consent rules from broader personal data protection frameworks:
            </p>
            <ul>
              <li>
                <strong>EU ePrivacy Directive &amp; UK PECR:</strong> Under the <em>EU ePrivacy Directive (Directive 2002/58/EC as amended by Directive 2009/136/EC), Article 5(3)</em> and the <em>UK Privacy and Electronic Communications Regulations (PECR), Regulation 6(4)</em>, prior user consent is expressly <strong>exempted</strong> for storage or access that is:
                <blockquote>
                  &quot;strictly necessary in order to provide an information society service explicitly requested by the subscriber or user.&quot;
                </blockquote>
                Our technical cookies correspond to this statutory exemption:
                <ul>
                  <li>The <code>session</code> cookie is set upon user action (signing in via GitHub or Google to maintain an authenticated session state across requests, or querying developer profiles as a guest to maintain search rate limits).</li>
                  <li>The <code>oauth_state</code> cookie is strictly necessary to ensure technical security against Cross-Site Request Forgery (CSRF) during the user-initiated authentication handshake.</li>
                </ul>
              </li>
              <li>
                <strong>Distinction from India&apos;s DPDP Framework:</strong> India&apos;s <em>Digital Personal Data Protection Act, 2023 (DPDP Act)</em> governs the processing of digital personal data by Data Fiduciaries (with its primary substantive obligations taking effect on 13 May 2027), rather than enacting a European-style cookie consent directive. Our cookie implementation adheres to the core data minimization and purpose limitation tenets of the DPDP framework.
              </li>
              <li>
                <strong>Jurisdictional Nuances:</strong> While European and UK regulatory frameworks exempt strictly necessary technical cookies from opt-in consent banners, legal standards and interpretations differ across international jurisdictions. Arsenic does not claim that its technical cookies are universally exempt from all regulatory notice or consent laws worldwide. Because Arsenic exclusively uses essential functional cookies and zero advertising, analytics, marketing, or cross-site tracking cookies, an opt-in tracking banner is not deployed. Users who do not wish to accept these technical cookies can disable cookies via their browser settings as detailed below.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>6. Managing and Disabling Cookies</h2>
            <p>
              You have full control over cookies stored on your device. You can configure your browser to block, delete, or alert you about cookies:
            </p>
            <ul>
              <li><strong>Chrome:</strong> Settings &rarr; Privacy and security &rarr; Third-party cookies &rarr; See all site data and permissions.</li>
              <li><strong>Firefox:</strong> Settings &rarr; Privacy &amp; Security &rarr; Cookies and Site Data &rarr; Manage Data.</li>
              <li><strong>Safari:</strong> Settings &rarr; Privacy &rarr; Manage Website Data.</li>
              <li><strong>Edge:</strong> Settings &rarr; Cookies and site permissions &rarr; Manage and delete cookies and site data.</li>
            </ul>
            <p>
              <em>Consequences of Disabling Cookies:</em> If you configure your browser to block all cookies: (1) you will be unable to log in with GitHub or Google because the essential <code>session</code> and <code>oauth_state</code> cookies cannot be set; and (2) guest search rate limiting will default to IP-based protections, potentially limiting repeated searches from shared network environments. Local search history will remain accessible unless local storage is also disabled.
            </p>
          </section>

          <section className="legalSection">
            <h2>7. Inquiries &amp; Contact</h2>
            <p>
              If you have any questions regarding our use of cookies or local storage, please reach out to:
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
