// Utility to normalize GitHub user input (username or profile URL)
// Returns { username, error? } where username is a string without leading @
// and error is a user‑facing validation message.
export function normalizeGithubInput(input: string): {
  username: string | null;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { username: null, error: 'Enter a GitHub username or GitHub profile URL.' };
  }

  // Remove leading @ if present
  const clean = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // Fast path: plain username (no slashes, no protocol, no dot)
  if (!clean.includes('/') && !clean.includes('://') && !clean.includes('.')) {
    return validateCandidate(clean);
  }

  // Ensure we have a URL – prepend protocol if missing for URL constructor
  let url: URL;
  try {
    const withProtocol = clean.startsWith('http') ? clean : `https://${clean}`;
    url = new URL(withProtocol);
  } catch {
    return { username: null, error: 'Enter a GitHub username or GitHub profile URL.' };
  }

  // Host must be github.com (allow www.)
  if (!/^((www\.)?github\.com)$/.test(url.hostname)) {
    return { username: null, error: 'Enter a GitHub username or GitHub profile URL.' };
  }

  // Path must contain exactly one non‑empty segment (the username)
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) {
    return { username: null, error: 'Enter a GitHub username or GitHub profile URL.' };
  }
  if (parts.length > 1) {
    // More than one segment → repository or other URL
    return { username: null, error: 'Please paste a GitHub profile URL, not a repository URL.' };
  }

  return validateCandidate(parts[0]);
}

function validateCandidate(candidate: string): { username: string | null; error?: string } {
  if (candidate.length > 39) {
    return { username: null, error: 'GitHub usernames cannot exceed 39 characters.' };
  }
  if (candidate.startsWith('-')) {
    return { username: null, error: 'GitHub usernames cannot start with a hyphen.' };
  }
  if (candidate.endsWith('-')) {
    return { username: null, error: 'GitHub usernames cannot end with a hyphen.' };
  }
  if (candidate.includes('--')) {
    return { username: null, error: 'GitHub usernames cannot contain consecutive hyphens.' };
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(candidate)) {
    return { username: null, error: 'GitHub usernames may only contain alphanumeric characters and single hyphens.' };
  }

  return { username: candidate };
}
