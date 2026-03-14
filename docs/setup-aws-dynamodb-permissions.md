# AWS permissions for medical processing and DynamoDB

Medical processing (call medical API + save to DynamoDB) runs in the **medical-process Lambda**. The Next.js app only proxies `POST /api/medical` to that Lambda.

## 1. medical-process Lambda

- **Location**: `lambdas/medical-process/`
- **Behavior**: Receives `{ text, operations }`, calls the upstream medical API (e.g. API Gateway `POST /medical` → Medical_parsing Lambda), then writes the result to DynamoDB and returns `{ id, createdAt, stored: true }`.

**Lambda environment variables:**

- **`MEDICAL_API_URL`** – Full URL of the medical API (e.g. `https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/medical`). Alternatively set **`API_GATEWAY_BASE_URL`** (e.g. `https://...amazonaws.com/prod`) and the Lambda will append `/medical`.
- **`MEDICAL_RESULTS_TABLE`** – DynamoDB table name (default: `trially-medical-results`).
- **`AWS_REGION`** – Region for DynamoDB (default: `us-east-1`).

**Lambda IAM role** must allow:

- **DynamoDB**: `dynamodb:PutItem` on the medical results table.
- **Network**: outbound HTTPS to the medical API URL (no extra policy if the Lambda is in a VPC that allows it, or use default no-VPC).

**Minimal policy** for the Lambda role (replace account and region/table as needed):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:YOUR_ACCOUNT_ID:table/trially-medical-results"
    }
  ]
}
```

Deploy the Lambda (e.g. zip `index.mjs` + `node_modules` from `lambdas/medical-process/` after `npm install`), then expose it via API Gateway (e.g. `POST /medical-process`). Set **`MEDICAL_PROCESS_API_URL`** (see below) to that API Gateway URL.

## 2. Next.js app (localhost & Vercel)

The app does **not** need AWS credentials. It only needs the URL of the medical-process Lambda’s API Gateway endpoint.

**Environment variable:**

- **`MEDICAL_PROCESS_API_URL`** – Full URL to invoke the medical-process Lambda (e.g. `https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/medical-process`).

Put this in **`.env.local`** for localhost and in **Vercel** → **Settings** → **Environment Variables** for production. No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` are required for the Next.js app for this flow.

## 3. Security

- Never commit API URLs or keys to git. `.env` and `.env*.local` are in `.gitignore`.
- Use a minimal IAM policy for the Lambda (only `dynamodb:PutItem` on the medical table).
- Rotate any API keys or credentials periodically.
