export const GITHUB_USERNAME_REGEX = /^(?!.*--)[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

export function isValidGitHubUsername(username) {
  if (typeof username !== 'string') return false
  const clean = username.replace(/^@/, '').trim()
  return GITHUB_USERNAME_REGEX.test(clean)
}

export function validateGitHubUsername(username) {
  if (typeof username !== 'string' || !username.trim()) {
    return { valid: false, error: 'GitHub username cannot be empty.' }
  }
  const clean = username.replace(/^@/, '').trim()
  if (clean.length > 39) {
    return { valid: false, error: 'GitHub username cannot exceed 39 characters.' }
  }
  if (clean.startsWith('-')) {
    return { valid: false, error: 'GitHub username cannot start with a hyphen.' }
  }
  if (clean.endsWith('-')) {
    return { valid: false, error: 'GitHub username cannot end with a hyphen.' }
  }
  if (clean.includes('--')) {
    return { valid: false, error: 'GitHub username cannot contain consecutive hyphens.' }
  }
  if (!GITHUB_USERNAME_REGEX.test(clean)) {
    return { valid: false, error: 'GitHub username may only contain alphanumeric characters and single hyphens.' }
  }
  return { valid: true, username: clean }
}
