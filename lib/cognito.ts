import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js'

const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID
const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID
const region = process.env.NEXT_PUBLIC_COGNITO_REGION

if (!userPoolId || !clientId || !region) {
  // These env vars must be provided at build-time. We don't throw here to
  // avoid breaking the bundle in environments where auth isn't configured yet.
  // The helpers below will surface a clear error instead.
}

function getUserPool() {
  if (!userPoolId || !clientId) {
    throw new Error('Cognito is not configured. Please set NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_CLIENT_ID.')
  }

  return new CognitoUserPool({
    UserPoolId: userPoolId,
    ClientId: clientId,
  })
}

export async function signUpWithEmail(email: string, password: string) {
  const pool = getUserPool()

  return new Promise<void>((resolve, reject) => {
    pool.signUp(
      email,
      password,
      [],
      [],
      (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      },
    )
  })
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<CognitoUserSession> {
  const pool = getUserPool()

  const user = new CognitoUser({
    Username: email,
    Pool: pool,
  })

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  })

  return new Promise((resolve, reject) => {
    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve(session)
      },
      onFailure: (err) => {
        reject(err)
      },
    })
  })
}

