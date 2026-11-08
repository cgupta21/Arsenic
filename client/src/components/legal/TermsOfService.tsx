import { ArrowLeft, FileText, Mail, CheckCircle2 } from 'lucide-react'

interface LegalPageProps {
  onBackToHome: () => void
  onNavigateTo: (route: string) => void
}

export function TermsOfService({ onBackToHome, onNavigateTo }: LegalPageProps) {
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
              className="legalNavPill active"
              onClick={() => onNavigateTo('/terms')}
              aria-current="page"
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

        <article className="legalContent" aria-labelledby="terms-heading">
          <header className="legalTitleBlock">
            <div className="legalBadge">
              <FileText size={16} aria-hidden="true" />
              <span>User Agreement &amp; Acceptable Use</span>
            </div>
            <h1 id="terms-heading" className="legalTitle">Terms of Service</h1>
            <p className="legalMeta">
              <strong>Effective Date:</strong> November 8, 2026 &bull; <strong>Last Updated:</strong> November 8, 2026
            </p>
          </header>

          <section className="legalSection">
            <h2>1. Acceptance of Terms</h2>
            <p>
              Welcome to <strong>Arsenic</strong> (&quot;the Service&quot;), accessible at{' '}
              <a href="https://arsenic-rho.vercel.app">https://arsenic-rho.vercel.app</a>. Arsenic is an independent, free software project developed and operated by an individual software developer based in India (&quot;we&quot;, &quot;us&quot;, or &quot;the Operator&quot;).
            </p>
            <p>
              By accessing, browsing, or using Arsenic, you agree to be bound by these Terms of Service (&quot;Terms&quot;) and our{' '}
              <button type="button" className="inlineLegalLink" onClick={() => onNavigateTo('/privacy')}>
                Privacy Policy
              </button>. If you do not agree to these Terms, please discontinue use of the Service.
            </p>
          </section>

          <section className="legalSection">
            <h2>2. Business Model &amp; Refund Notice</h2>
            <div className="legalNoticeBox">
              <div className="noticeHeader">
                <CheckCircle2 size={18} aria-hidden="true" />
                <strong>100% Free Application — No Payment Transactions</strong>
              </div>
              <p>
                Arsenic is currently provided completely free of charge. We do not sell subscriptions, paid feature tiers, enterprise licenses, or digital products. There is no checkout flow, no payment gateway integration, and no credit card collection.
              </p>
              <p>
                <strong>Refund Policy:</strong> Because Arsenic is entirely free and conducts no commercial or monetary transactions, no refund, payment reversal, or billing cancellation process applies. If our business model changes in the future, this notice and these Terms will be updated prior to any changes taking effect.
              </p>
            </div>
          </section>

          <section className="legalSection">
            <h2>3. Description of Service &amp; Data Sources</h2>
            <p>
              Arsenic provides developer intelligence, repository activity metrics, contribution cadence visualizations, and automated profile summaries based on publicly available data obtained through the GitHub REST and GraphQL APIs.
            </p>
            <p>
              <strong>Important Clarifications:</strong>
            </p>
            <ul>
              <li>
                <strong>Informational Purpose Only:</strong> All metrics, health scores (0–100), timing distribution graphs, and automated summaries are generated algorithmically for informational, educational, and exploratory purposes. They do not constitute formal employment assessments, technical endorsements, or professional evaluations.
              </li>
              <li>
                <strong>Third-Party Data Dependency:</strong> Arsenic relies entirely on telemetry reported by GitHub APIs. We do not independently verify, modify, or guarantee the accuracy, completeness, or timeliness of public GitHub commit events, repository stars, forks, or profile descriptions. Users should verify critical codebase information directly on GitHub.
              </li>
              <li>
                <strong>Automated Summaries:</strong> Synthesized profile summaries are generated locally by deterministic algorithmic heuristics in our application code. They do not use external generative artificial intelligence (AI) models or third-party LLMs.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>4. Authentication &amp; User Accounts</h2>
            <ul>
              <li>
                <strong>Optional Sign-In:</strong> You may explore Arsenic as a guest without creating an account or signing in. Unauthenticated visitors receive a standard allowance of free searches.
              </li>
              <li>
                <strong>OAuth Authentication:</strong> To unlock unlimited queries, you may optionally sign in using your existing GitHub or Google account. We request read-only permissions and do not receive or store your third-party account passwords.
              </li>
              <li>
                <strong>Session Security:</strong> You are responsible for maintaining the security of your device and the OAuth credentials used to access the Service. You can terminate your active session at any time by clicking &quot;Sign out&quot; or by revoking access in your GitHub or Google account security settings.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>5. Acceptable Use &amp; Prohibited Conduct</h2>
            <p>When using Arsenic, you agree not to:</p>
            <ul>
              <li>Use the Service for any unlawful purpose or in violation of any applicable local, national, or international law.</li>
              <li>Overload, flood, disrupt, or launch denial-of-service (DoS) attacks against our servers, API endpoints, or edge hosting infrastructure.</li>
              <li>Circumvent, tamper with, or bypass rate limits, authentication tokens, guest search quotas, or CSRF security headers.</li>
              <li>Use automated scrapers, bots, or extraction scripts to harvest data from Arsenic without our prior written authorization.</li>
              <li>Attempt to decompile, reverse-engineer, or probe the Service for vulnerabilities outside of responsible vulnerability disclosure practices.</li>
              <li>Use the Service to harass, stalk, defame, or intimidate any developer or organization.</li>
              <li>Misrepresent your identity or imply any false affiliation with Arsenic or its Operator.</li>
            </ul>
            <p>
              We reserve the right to suspend or block access from IP addresses or accounts that violate these rules or engage in malicious or abusive traffic patterns.
            </p>
          </section>

          <section className="legalSection">
            <h2>6. Intellectual Property &amp; Nominative Fair Use</h2>
            <ul>
              <li>
                <strong>Arsenic IP:</strong> The Arsenic name, logo, graphic assets, interface styling, and source code are the intellectual property of the Operator, protected under applicable copyright and intellectual property laws, or licensed under applicable open-source software licenses.
              </li>
              <li>
                <strong>GitHub &amp; Google Trademarks:</strong> &quot;GitHub&quot;, the Octocat logo, and related marks are registered trademarks of GitHub, Inc. &quot;Google&quot; and the Google logo are registered trademarks of Google LLC. Arsenic uses these marks strictly under nominative fair use to describe compatible authentication methods and data sources.
              </li>
              <li>
                <strong>Independence Disclaimer:</strong> Arsenic is an independent developer analytics tool. It is <strong>not affiliated with, endorsed by, sponsored by, or operated by GitHub, Inc., Microsoft Corporation, or Google LLC</strong>.
              </li>
              <li>
                <strong>Repository &amp; Developer Data:</strong> Code, repository content, and contributions analyzed by Arsenic remain the intellectual property of their respective creators and repository owners, subject to the applicable open-source licenses or terms under which they are published on GitHub.
              </li>
            </ul>
          </section>

          <section className="legalSection">
            <h2>7. Disclaimer of Warranties</h2>
            <p className="legalDisclaimer">
              THE SERVICE IS PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMISSIBLE UNDER APPLICABLE LAW, THE OPERATOR DISCLAIMS ALL WARRANTIES, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </p>
            <p>
              Without limiting the foregoing, we do not warrant that the Service will be uninterrupted, error-free, secure, or free from server downtime, API outages, or data inaccuracies arising from third-party services.
            </p>
            <p>
              <em>Statutory Consumer Rights:</em> Nothing in this Section or these Terms excludes, restricts, or modifies any statutory consumer guarantees, rights, or remedies conferred by applicable laws (including India&apos;s Consumer Protection Act, 2019) that cannot be lawfully excluded, restricted, or disclaimed.
            </p>
          </section>

          <section className="legalSection">
            <h2>8. Limitation of Liability</h2>
            <p className="legalDisclaimer">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE OPERATOR BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, DATA, USE, GOODWILL, OR BUSINESS OPPORTUNITIES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.
            </p>
            <p>
              Because Arsenic is provided entirely free of charge with no commercial transactions, any liability of the Operator for direct claims arising under or in connection with these Terms or the Service is limited strictly to the maximum extent permitted by applicable law.
            </p>
            <p>
              <em>Non-Excludable Statutory Rights:</em> The foregoing limitations and exclusions apply only to the extent permitted by applicable law. Nothing in these Terms purports to exclude, restrict, or modify any statutory consumer rights, guarantees, or remedies (including under India&apos;s Consumer Protection Act, 2019) that cannot be lawfully excluded or limited, nor does it purport to disclaim liability that cannot be excluded under applicable mandatory legislation.
            </p>
          </section>

          <section className="legalSection">
            <h2>9. Termination &amp; Service Modifications</h2>
            <p>
              We reserve the right to modify, update, pause, or discontinue any feature, endpoint, or the entirety of the Service at any time without prior notice or liability. You may stop using the Service at any time.
            </p>
          </section>

          <section className="legalSection">
            <h2>10. Governing Law &amp; Jurisdiction</h2>
            <p>
              These Terms of Service and any dispute or claim arising out of or related to your use of Arsenic shall be governed by and construed in accordance with the laws of <strong>India</strong>, without regard to its conflict-of-law principles. Any legal actions or proceedings shall be subject to the exclusive jurisdiction of the competent courts in India, subject to mandatory statutory consumer rights that cannot be waived.
            </p>
          </section>

          <section className="legalSection">
            <h2>11. Contact &amp; Inquiries</h2>
            <p>
              For questions, feedback, or legal inquiries concerning these Terms, please contact us at:
            </p>
            <div className="contactCard">
              <Mail size={18} aria-hidden="true" />
              <div>
                <strong>Support &amp; Legal Inquiries</strong>
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
