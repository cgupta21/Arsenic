import { useMemo } from 'react'
import { History, TrendingUp, TrendingDown, Minus, Calendar, AlertCircle } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts'
import type { HistorySummary, ScoreSnapshot } from '../types'
import { getHealthGradeColor } from '../../../shared/score.js'

export interface ScoreHistoryCardProps {
  history?: HistorySummary | null
  currentScore: number
  username: string
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T00:00:00Z`)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  } catch {
    return dateStr
  }
}

export function ScoreHistoryCard({ history, currentScore, username }: ScoreHistoryCardProps) {
  const snapshots = useMemo(() => history?.snapshots || [], [history?.snapshots])
  const current = history?.currentScore ?? currentScore
  const previous = history?.previousScore ?? null
  const change = history?.scoreChange ?? null

  const chartData = useMemo(() => {
    return snapshots.map((s: ScoreSnapshot) => ({
      date: s.date,
      formattedDate: formatDateShort(s.date),
      score: s.score,
      grade: s.grade,
      consistency: s.breakdown?.consistency ?? 0,
      collaboration: s.breakdown?.collaboration ?? 0,
      impact: s.breakdown?.impact ?? 0
    }))
  }, [snapshots])

  const renderTrendBadge = () => {
    if (change === null || snapshots.length < 2) {
      return <span className="trendBadge neutral"><Minus size={12} /> Baseline</span>
    }
    if (change > 0) {
      return <span className="trendBadge positive"><TrendingUp size={12} /> +{change} pts</span>
    }
    if (change < 0) {
      return <span className="trendBadge negative"><TrendingDown size={12} /> {change} pts</span>
    }
    return <span className="trendBadge neutral"><Minus size={12} /> Unchanged</span>
  }

  return (
    <article className="card scoreHistoryCard" id="score-history">
      <div className="cardHead">
        <h3><History size={16} />Score history & trajectory</h3>
        <div className="historyHeadAction">
          {renderTrendBadge()}
          <span className="historyCount">
            {snapshots.length === 1 ? '1 snapshot' : `${snapshots.length} snapshots`}
          </span>
        </div>
      </div>

      {history?.warning && (
        <div className="historyStorageNotice" role="status">
          <AlertCircle size={13} />
          <span>{history.warning}</span>
        </div>
      )}

      <div className="scoreHistoryStats">
        <div className="scoreHistoryStat">
          <span className="historyStatLabel">Current score</span>
          <div className="historyStatVal">
            <b>{current}</b><small>/100</small>
            <span
              className="gradeDot"
              style={{ background: getHealthGradeColor(current) }}
              title="Current health color"
            />
          </div>
        </div>

        <div className="scoreHistoryStat">
          <span className="historyStatLabel">Previous score</span>
          <div className="historyStatVal">
            {previous !== null ? (
              <>
                <b>{previous}</b><small>/100</small>
                <span
                  className="gradeDot"
                  style={{ background: getHealthGradeColor(previous) }}
                  title="Previous health color"
                />
              </>
            ) : (
              <span className="mutedValue">—</span>
            )}
          </div>
        </div>

        <div className="scoreHistoryStat">
          <span className="historyStatLabel">Score delta</span>
          <div className="historyStatVal">
            {change !== null && snapshots.length >= 2 ? (
              <span className={change > 0 ? 'deltaPositive' : change < 0 ? 'deltaNegative' : 'deltaNeutral'}>
                {change > 0 ? `+${change}` : change}
              </span>
            ) : (
              <span className="mutedValue">—</span>
            )}
          </div>
        </div>

        <div className="scoreHistoryStat">
          <span className="historyStatLabel">Observation window</span>
          <div className="historyStatVal windowVal">
            {snapshots.length >= 2 ? (
              <span>{formatDateShort(snapshots[0].date)} – {formatDateShort(snapshots[snapshots.length - 1].date)}</span>
            ) : snapshots.length === 1 ? (
              <span>Recorded {formatDateShort(snapshots[0].date)}</span>
            ) : (
              <span className="mutedValue">Awaiting signal</span>
            )}
          </div>
        </div>
      </div>

      {snapshots.length >= 2 ? (
        <div className="historyChartContainer">
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scoreHistoryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58A65C" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#58A65C" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid)" vertical={false} />
                <XAxis
                  dataKey="formattedDate"
                  stroke="var(--muted)"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  allowDecimals={false}
                  stroke="var(--muted)"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as {
                      date: string
                      score: number
                      grade: string
                      consistency: number
                      collaboration: number
                      impact: number
                    }
                    return (
                      <div className="historyTooltip">
                        <div className="tooltipHead">
                          <span>{data.date}</span>
                          <b style={{ color: getHealthGradeColor(data.score) }}>{data.score}/100</b>
                        </div>
                        <div className="tooltipGrade">{data.grade}</div>
                        <div className="tooltipBreakdown">
                          <span>Consistency: {data.consistency}</span>
                          <span>Collaboration: {data.collaboration}</span>
                          <span>Impact: {data.impact}</span>
                        </div>
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#58A65C"
                  fill="url(#scoreHistoryGradient)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#58A65C', stroke: 'var(--card)', strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: '#58A65C' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : snapshots.length === 1 ? (
        <div className="historySingleState">
          <div className="singleStateIcon">
            <Calendar size={20} />
          </div>
          <div className="singleStateContent">
            <h4>Baseline recorded on {formatDateShort(snapshots[0].date)}</h4>
            <p>
              Your initial score snapshot of <strong>{snapshots[0].score}/100</strong> ({snapshots[0].grade}) has been logged.
              Trend charts and delta benchmarks will visualize health trajectory as new daily evaluations accumulate.
            </p>
          </div>
        </div>
      ) : (
        <div className="historyEmptyState">
          <div className="emptyStateIcon">
            <AlertCircle size={20} />
          </div>
          <div className="emptyStateContent">
            <h4>No score history recorded yet</h4>
            <p>
              Score snapshots are recorded automatically whenever @{username}'s developer profile is analyzed.
              Check back on subsequent days to observe health score trajectory over time.
            </p>
          </div>
        </div>
      )}
    </article>
  )
}
