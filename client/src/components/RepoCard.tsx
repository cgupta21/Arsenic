import { Archive, ArrowUpRight, GitBranch, Star } from 'lucide-react'
import type { Repo } from '../types'
import { compactNumber, relativeDays } from '../lib/analytics'

export function RepoCard({ repo }: { repo: Repo }) {
  const status = repo.status || 'watch'
  return (
    <a className="repoCard" href={repo.html_url} target="_blank" rel="noreferrer">
      <div className="repoTop"><div className="repoStatus"><span className={`statusDot ${status}`} />{status}</div><ArrowUpRight size={16} aria-hidden="true" /></div>
      <h3>{repo.name}</h3>
      <p>{repo.description || 'No description provided.'}</p>
      <div className="repoMeta">
        <span>{repo.language || 'Mixed'}</span>
        <span><Star size={13} />{compactNumber(repo.stargazers_count)}</span>
        <span><GitBranch size={13} />{compactNumber(repo.forks_count)}</span>
        <span>Issues {repo.open_issues_count}</span>
        {repo.archived && <span><Archive size={13} />Archived</span>}
      </div>
      <small className="repoUpdated">Updated {relativeDays(repo.updated_at)}d ago · issue ratio {repo.issueRatio ?? 0}%</small>
    </a>
  )
}
