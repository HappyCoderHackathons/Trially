import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers"

const STORAGE_KEY = "trially_cognito_session"

export type StoredSession = {
  idToken: string
  accessToken: string
  refreshToken: string
}

/**
 * Get the current Cognito User Pool id token from localStorage.
 * Required for authenticated access to AWS services (e.g. Textract) via Identity Pool.
 */
export function getIdToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return parsed?.idToken ?? null
  } catch {
    return null
  }
}

/**
 * Returns AWS credential provider for the browser using Cognito Identity Pool
 * with the current User Pool id token (authenticated identity).
 *
 * Requires:
 * - NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID
 * - NEXT_PUBLIC_COGNITO_USER_POOL_ID
 * - NEXT_PUBLIC_COGNITO_REGION
 * - User to be signed in (idToken in localStorage under trially_cognito_session)
 */
export function getAwsCredentialProvider() {
  const identityPoolId = process.env.NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION

  const missing = [
    !identityPoolId && "NEXT_PUBLIC_COGNITO_IDENTITY_POOL_ID",
    !userPoolId && "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
    !region && "NEXT_PUBLIC_COGNITO_REGION",
  ].filter(Boolean) as string[]

  if (missing.length > 0) {
    throw new Error(
      `AWS credentials not configured. Missing in .env: ${missing.join(", ")}. Restart the dev server after changing .env. See docs/setup-aws-credentials.md`
    )
  }

  const idToken = getIdToken()
  if (!idToken) {
    throw new Error(
      "You must be signed in to extract text from documents. Sign in and try again."
    )
  }

  const loginKey = `cognito-idp.${region}.amazonaws.com/${userPoolId}`

  return fromCognitoIdentityPool({
    clientConfig: { region },
    identityPoolId,
    logins: {
      [loginKey]: idToken,
    },
  })
}
