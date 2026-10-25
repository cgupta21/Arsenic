import type { HistorySummary } from '../shared/history.js'

export function getHistoryDir(): string

export function getUserFilePath(username: string): string

export function atomicWriteFile(filePath: string, content: string): Promise<void>

export function withUserLock<T>(username: string, action: () => Promise<T>): Promise<T>

export function resolveRedisConfig(
  env?: Record<string, string | undefined>
): { url: string; token: string } | null

export function getStorageMode(
  env?: Record<string, string | undefined>
): 'redis' | 'ephemeral-warning' | 'file'

export function sanitizeError(err: unknown, token?: string): string

export function getRedisKey(username: string): string

export function executeRedisCommand(
  command: string,
  args: unknown[],
  config: { url: string; token: string }
): Promise<unknown>

export function readUserHistory(username: string): Promise<HistorySummary>

export function recordScoreSnapshot(
  username: string,
  scoreData: {
    score: number
    breakdown?: { consistency?: number; collaboration?: number; impact?: number }
  },
  targetDate?: string
): Promise<HistorySummary>

export function clearUserHistory(username: string): Promise<void>

export function clearAllMemoryHistory(): void
