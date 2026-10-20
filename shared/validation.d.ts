export declare const GITHUB_USERNAME_REGEX: RegExp
export declare function isValidGitHubUsername(username: unknown): boolean
export declare function validateGitHubUsername(username: unknown): {
  valid: boolean
  username?: string
  error?: string
}
