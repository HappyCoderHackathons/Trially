# Trially

**Clinical trial matching, powered by conversation.**

## Inspiration

More than 80% of clinical trials fail to meet their enrollment targets on time, not because the patients don't exist, but because the tools for finding them are broken. ClinicalTrials.gov lists over 400,000 studies, but searching it requires knowing the right medical terminology, understanding inclusion criteria written for clinicians, and having the time and persistence to sift through hundreds of irrelevant results. Most patients never make it through that process.

The burden falls hardest on those already underserved by the healthcare system: patients who don't speak English as a first language, people without consistent access to specialists, and communities historically excluded from research. Clinical trials have a diversity problem, and a large part of it is simply that the people who could qualify never find out they can participate.

We built Trially to fix that. Instead of a search box, patients get a conversation. Instead of jargon, they get questions in their own language. Instead of sifting through raw trial listings, they get matched results with a plain-language explanation of why each trial is relevant to them.

## What it does

Trially replaces the broken trial search experience with a conversation. Patients talk through their condition, by voice or text, and Trially handles the rest: extracting a structured health profile from what they say and any documents they upload, running that profile against real-time ClinicalTrials.gov data, and returning matched results with a plain-language AI recommendation explaining which trials are most relevant and why. Patients can save trials to a personal dashboard and edit their profile over time as their condition evolves.

Trially is HIPAA compliant. All patient data is automatically deleted after a 7-day TTL, enforced at the DynamoDB layer, so no sensitive health information persists beyond what is needed to deliver results.

The entire intake experience is multilingual. ElevenLabs powers the conversational agent in 30+ languages, so a Spanish-speaking patient in rural Texas or a Mandarin speaker without access to a nearby research hospital gets the same quality of experience as anyone else, no interpreter required, no English-only forms. The barrier is not just language. It is that the existing search tools assume a level of medical literacy and system access that most patients do not have. Trially assumes neither.

## How we built it

The entire backend runs on AWS. Here's how each service fits in:

### Intake and Identity

- **Amazon Cognito** handles sign-up, sign-in, and JWT issuance. An `autoVerify` Lambda trigger auto-confirms users so onboarding is frictionless.
- **ElevenLabs Conversational AI** powers the intake interview, a voice agent that asks the patient about their diagnosis, symptoms, medications, history, and preferences in natural conversation over a WebSocket connection. **ElevenLabs Scribe** (`scribe_v2_realtime`) handles real-time speech-to-text on every text input so patients can speak instead of type.

### Document Processing Pipeline

- Uploaded medical documents (PDFs, images) go through **AWS Textract** directly from the browser using Cognito Identity Pool credentials, extracting raw text client-side.
- That text is sent to a **Medical_parsing Lambda** which runs **Amazon Comprehend Medical**, using `detect_entities`, `detect_phi`, `infer_icd10`, `infer_rx_norm`, and `infer_snomed` to turn unstructured notes into structured medical data with standard coding.
- A **Connect_LLM Lambda** forwards this to **Featherless AI** (open-source inference, `Qwen/Qwen2.5-7B-Instruct`) to synthesize a clean patient profile narrative.

### Trial Matching

- The **trialsapi Lambda** runs our matching engine against the ClinicalTrials.gov API with a two-layer cache: **Amazon ElastiCache (Valkey)** as the hot L1 cache (1-hour TTL, TLS on port 6380) backed by **DynamoDB** as the cold L2 cache (24-hour TTL). Cache misses hit the live API; hits return in milliseconds.
- A **Show_result Lambda** takes the matched trial list and patient profile and calls Featherless AI again to generate a personalized plain-language recommendation.

### Orchestration and Observability

- **AWS Step Functions** orchestrates the multi-step pipeline, coordinating Textract, Comprehend Medical, LLM, trial search, and recommendation in sequence with error handling at each stage.
- A dedicated **pipeline-logger Lambda** writes a timestamped record of every pipeline step to DynamoDB (`trially-pipeline-steps`, 7-day TTL), surfaced in the app's transparency page so patients can see exactly how their results were generated.
- **Amazon SQS** buffers high-volume intake requests to prevent Lambda concurrency spikes during traffic bursts.
- **AWS X-Ray** traces requests end-to-end across Lambda invocations so we can identify latency bottlenecks in the pipeline.
- **Amazon CloudWatch** aggregates Lambda logs, tracks pipeline error rates, and monitors ElastiCache hit ratios.
- **AWS KMS** encrypts sensitive patient data at rest in DynamoDB.
- All patient records carry a **7-day DynamoDB TTL**, automatically expiring data after results are delivered to keep the platform HIPAA compliant without requiring manual cleanup.
- **IAM** enforces least-privilege roles, with each Lambda scoped only to the DynamoDB tables and downstream services it needs.

### Frontend

- Next.js 15 App Router deployed on Vercel, using **API Gateway** as the HTTP entry point for all Lambda functions. Patient profiles and starred trials are stored per-user in DynamoDB and tied to their Cognito `sub` claim via a `userId-index` GSI.

## Challenges we ran into

**AWS credential management in the browser.** Running Textract client-side through a Cognito Identity Pool required careful IAM role scoping and credential refresh logic. Getting temporary STS credentials flowing correctly without exposing secrets took significant debugging.

**Avoiding double-invocations.** React 18 StrictMode double-fires `useEffect` in development. With expensive LLM calls behind each effect, this caused 429 concurrency errors on the Featherless API. We solved this with `AbortController` signals so the first (aborted) request cancels cleanly before hitting the model.

**Stable trial identifiers.** Our initial implementation used positional indices as trial IDs, which meant a trial starred from one search could not be recognized as already-starred in a later search. We migrated to using NCT IDs as the stable primary key for all starring operations.

**Two-layer cache consistency.** Keeping Valkey and DynamoDB in sync required careful backfill logic: DynamoDB cache hits repopulate Valkey so the hot cache self-heals after a cold start without requiring explicit invalidation.

**ElevenLabs conversation state.** Detecting when the intake interview was complete required parsing `<done>` markers out of the agent's response stream and cleanly tearing down the WebSocket before routing to results. Handling mid-conversation page navigations without leaving orphaned connections took several iterations.

## Accomplishments that we're proud of

- A voice-first medical intake flow that feels genuinely conversational, not like filling out a form
- A fully observable pipeline where patients can see every step that produced their results, rare transparency for an AI health tool
- Sub-second trial results on cache hits via Valkey, even against a dataset of hundreds of thousands of trials
- End-to-end user identity threading: Cognito JWT flows from the browser through every API route and Lambda, ensuring every piece of stored data is correctly scoped to the right patient
- HIPAA-compliant data lifecycle: all patient records are automatically purged after 7 days via DynamoDB TTL, with KMS encryption at rest throughout

## What we learned

Building on AWS at this scale forced us to internalize the principle of Lambda-as-the-only-DynamoDB-accessor. Direct SDK calls from Next.js hit credential expiry issues immediately. Routing all writes through Lambda functions eliminated an entire class of auth bugs. We also learned that Comprehend Medical's ICD-10 and SNOMED inference is surprisingly accurate on messy, conversational medical text. The structured codes it produces are what make precise trial matching possible.

## What's next for Trially

- **Physician portal:** let doctors refer patients directly into the matching pipeline and track enrollment outcomes
- **Trial notifications:** alert patients when new trials open that match their profile
- **EHR integration:** pull structured data from hospital systems via FHIR APIs, bypassing the manual intake flow entirely
- **Deeper multilingual support:** the intake agent already speaks 30+ languages via ElevenLabs; next is ensuring Comprehend Medical's downstream entity extraction handles non-English clinical terminology with the same fidelity
- **Outcome tracking:** close the loop by letting enrolled patients report back, building a dataset to improve matching accuracy over time

## AWS Services Used

| Service | Purpose |
|---|---|
| Lambda | 16 functions covering intake, parsing, matching, logging, and profile management |
| DynamoDB | Medical results, pipeline logs, trial cache, starred trials, patient profiles |
| API Gateway | HTTP entry point for all Lambda functions |
| Cognito | User authentication, JWT issuance, Identity Pool for browser-side AWS access |
| Textract | Client-side PDF and image text extraction |
| Comprehend Medical | Medical entity recognition, PHI detection, ICD-10/RxNorm/SNOMED inference |
| ElastiCache (Valkey) | L1 hot cache for ClinicalTrials.gov results (1-hour TTL, TLS) |
| Step Functions | Pipeline orchestration across Textract, Comprehend, LLM, search, and recommendation |
| SQS | Request buffering to prevent Lambda concurrency spikes |
| X-Ray | End-to-end distributed tracing across Lambda invocations |
| CloudWatch | Log aggregation, error rate monitoring, cache hit ratio dashboards |
| KMS | Encryption at rest for sensitive patient data in DynamoDB |
| IAM | Least-privilege roles scoped per Lambda function |

## AI APIs Used

| Service | Purpose |
|---|---|
| ElevenLabs Conversational AI | Voice-driven patient intake interview over WebSocket |
| ElevenLabs Scribe v2 | Real-time speech-to-text on search and chat inputs |
| Featherless AI (Qwen/Qwen2.5-7B-Instruct) | Patient profile synthesis and trial recommendation generation |
