# Eval grades: Grounded Answers build vs. AWS Docs AI

Status: APPROVED by Lisa on Nov 3, 2026, with no changes. Claude drafted the grades; Lisa checked them against the answers.

- Build runs: `evals/runs/2026-11-03-build/` (15 questions plus FU), `2026-11-03-fu2/` and `2026-11-03-fu3/` (FU 2 and 3). Nov 3, claude-sonnet-5-5, effort low, locked request. 20 paid requests, $0.27.
- AWS runs: `baseline/` (live AWS Docs AI, Oct 26).
- Questions and expected answers: `evals/questions.md` and the "A good answer says" column of the test script.

## Grading rule

Each question gets Pass or Fail on 3 things. A question passes only if all 3 pass.

1. **Answer.** It matches "A good answer says". For a question the docs don't answer, it says so and invents nothing.
   - N1: it can give $0.023 only if it says the number comes from an example that names no Region, and points to the pricing page.
   - N3: it says "No", plus S3 or a signed URL.
   - N5: it says the docs don't state that need. A firm "yes" fails. A firm "no" from pages outside the doc set fails.
   - P2: it covers both TagResource APIs or asks which one.
2. **Citation.** One miss = Fail. An [n] covers the sentences before it, back to the previous [n] in the same paragraph or bullet. A list whose lead-in line ends with an [n] counts as covered by it. A miss is a claim about how AWS works with no [n] that covers it. These are not misses: advice ("check the pricing page"), remarks about what the docs do or don't cover, a conclusion drawn only from a cited fact in the same paragraph ("so suspending would break that requirement"), headings and list labels. An answer that cites 0 sources passes only if it states no doc facts.
3. **Confidence signal (UI only).** F1 to F5, P1 to P5 and N3: no badge and no GA-4. N1: Low badge. N2, N4, N5: GA-4. Text hedges do not count. They go in the notes.

FU is graded on the body after the code-written opening (decision 56): Pass if the body stays on DSSE-KMS.

**When the rules were set.** The rules for answer, confidence and "one miss = Fail" were set before anyone read the answers. The citation reading above (an [n] covers its group of sentences) was set after a first read, because a rule that needs an [n] on every sentence failed every answer on both sides and could not tell them apart.

## Summary

| | Build (Nov 3) | AWS Docs AI (Oct 26) |
|---|---|---|
| All 3 pass | 7 of 15 | 1 of 15 |
| Answer | 14 of 15 | 11 of 15 |
| Citation | 8 of 15 | 1 of 15 |
| Confidence signal | 14 of 15 | 11 of 15 |
| FU ("the third one") | 3 of 3 | 0 of 3 |

Limits:
- One run per question (FU 3 runs). This is a result for a demo, not a statistic.
- The two sides did not read the same docs. The build reads 25 sections picked with these questions in view (decision 41). AWS Docs AI searches all AWS docs. The build's job is easier on purpose, so the comparison tests the answer design (citations, badge, GA-4, follow-up), not search.
- AWS FU: all 3 runs gave the same text word for word. AWS may cache answers, so this may be 1 independent sample.
- For AWS, citation support was checked only by whether a claim has an [n]. The pages AWS cited were not opened. No AWS answer was failed for a wrong source.

## Build grades

| ID | Answer | Citation | Confidence | All 3 | Reason |
|---|---|---|---|---|---|
| F1 S3 encryption options | Pass | Pass | Pass | **Pass** | 4 options in order: SSE-S3, SSE-KMS, DSSE-KMS, SSE-C. Every claim covered. |
| F2 turn off versioning | Pass | Fail | Pass | Fail | Right answer (never unversioned, can suspend). Miss: "a bucket can be in one of three states" has no [n]. |
| F3 charged per version | Pass | Fail | Pass | Fail | Right answer (3 versions = 3 objects). Miss: "Its example expires noncurrent versions after 7 days" has no [n]. |
| F4 replication setup | Pass | Fail | Pass | Fail | All 7 requirements. Miss: "In practice that is an IAM role you specify in the replication configuration" is not in the cited section. |
| F5 export encryption | Pass | Fail | Pass | Fail | SSE-S3 or SSE-KMS. Miss: "you pick the encryption options in the console when you add the bucket destination" has no [n]. |
| P1 replicate existing objects | Pass | Pass | Pass | **Pass** | Batch Replication; live replication is for new objects only. Note: one garbled sentence joins two true facts with "since" ("SSE-C objects need no extra permissions, since to replicate existing objects, use Batch Replication"). |
| P2 TagResource | Pass | Pass | Pass | **Pass** | Covers both the Data Exchange and the S3 Control API, with paths and body format. |
| P3 replicating SSE-KMS objects | Pass | Fail | Pass | Fail | Not by default; SourceSelectionCriteria with SseKmsEncryptedObjects; destination key in the destination Region. Miss: "You can request a quota increase through Service Quotas" has no [n] (the doc says it). |
| P4 suspend versioning | Pass | Pass | Pass | **Pass** | Existing versions don't change; only future requests change. |
| P5 data grant files to S3 | Pass | Pass | Pass | **Pass** | Entitled data sets, export to S3 or a signed URL, auto-export steps. |
| N1 S3 storage price | Pass | Pass | Pass | **Pass** | Says the docs have no us-east-1 price; $0.023 is from an example with no Region; points to the pricing page. Low badge and GA-4. Note: also names the AWS Pricing Calculator, which is not in the doc set (the same thing medium did on Nov 2). |
| N2 export job time | Pass | Fail | Pass | Fail | Says the docs don't give a time; invents none. GA-4. Miss: 0 cited, but states a doc fact ("the State field in the Jobs section changes to Completed"). |
| N3 export to Google Cloud | Fail | Pass | Fail | Fail | Says "I can't confirm a direct export is supported" in place of "No", though the docs list only S3 and a signed URL. Started with [NO_ANSWER], so GA-4 showed: a false alarm. |
| N4 Data Exchange tag limit | Pass | Fail | Pass | Fail | Says the docs give no limit; invents none. GA-4. Miss: 0 cited, but describes the TagResource syntax ("a tags map of string keys to string values"). |
| N5 DSSE-KMS for HIPAA | Pass | Pass | Pass | **Pass** | Says the docs don't say; no firm yes or no. GA-4. |

### FU ("the third one", body only)

| Run | Grade | Reason |
|---|---|---|
| FU 1 (build) | Pass | Whole body on DSSE-KMS: two layers, cost and latency, no Bucket Keys, bucket policy, replication opt-in. |
| FU 2 (fu2) | Pass | Whole body on DSSE-KMS. |
| FU 3 (fu3) | Pass | Whole body on DSSE-KMS. Note: the first sentence after the opening repeats itself ("two independent layers of AES-256 encryption" twice). |

## AWS Docs AI grades

| ID | Answer | Citation | Confidence | All 3 | Reason |
|---|---|---|---|---|---|
| F1 S3 encryption options | Pass | Fail | Pass | Fail | 4 options. Miss: "No additional configuration required" (SSE-S3) has no [n]. |
| F2 turn off versioning | Pass | Fail | Pass | Fail | Right answer. Misses: the "What suspended means" bullets ("Existing objects in the bucket do not change", null version IDs) have no [n]. |
| F3 charged per version | Pass | Fail | Pass | Fail | Right answer. Misses: "Each version is a full copy" and the delete marker bullet have no [n]. |
| F4 replication setup | Pass | Fail | Pass | Fail | Versioning, Regions, IAM role, plus more. Miss: "You must create an IAM role..." and its trust policy bullet have no [n]. |
| F5 export encryption | Pass | Fail | Pass | Fail | SSE-S3 or SSE-KMS. Miss: "This parameter is only required when using KMS encryption" has no [n]. |
| P1 replicate existing objects | Pass | Fail | Pass | Fail | Batch Replication with console and CLI steps. Misses: the console steps have no [n]. |
| P2 TagResource | Fail | Fail | Pass | Fail | Covers RAM, Config, Service Quotas and Lambda, not Data Exchange or S3 Control, and doesn't ask which service. Misses: request formats and limits ("up to 50 tags") have no [n]. |
| P3 replicating SSE-KMS objects | Pass | Pass | Pass | **Pass** | Not by default; update the replication configuration; KMS permissions; keys per Region. Every section covered by an [n]. Note: doesn't name SseKmsEncryptedObjects or the destination key element. |
| P4 suspend versioning | Pass | Fail | Pass | Fail | Existing versions don't change. Misses: the DELETE behavior bullets have no [n]. |
| P5 data grant files to S3 | Pass | Fail | Pass | Fail | Splits by grant type; export to S3 for file-based data. Misses: the console steps and "use CopyObject or s3 cp" have no [n]. |
| N1 S3 storage price | Fail | Fail | Fail | Fail | States $0.023 for us-east-1 and says the example uses "US-East-1 standard pricing". The cost example names no Region. That claim has no [n]. No UI signal. |
| N2 export job time | Pass | Fail | Fail | Fail | Says it couldn't find a time; invents none. Miss: "job duration will depend on factors like number of assets, asset sizes, and network conditions" has no [n]. No UI signal (text hedge only). |
| N3 export to Google Cloud | Pass | Fail | Pass | Fail | Says "No", exports go to S3. Misses: that answer and the DataSync workaround have no [n]. |
| N4 Data Exchange tag limit | Fail | Fail | Fail | Fail | Says the docs give no limit, then brings in "a standard limit of 50 tags per resource" it says it can't confirm. That claim has no [n]. No UI signal (text hedge only). |
| N5 DSSE-KMS for HIPAA | Fail | Fail | Fail | Fail | Firm "No", with SSE-KMS "sufficient", drawn from ECS, Connect, RDS and HealthLake pages. That conclusion has no [n]. No UI signal. |

### FU ("the third one", body only)

| Run | Grade | Reason |
|---|---|---|
| FU-1 | Fail | Names DSSE-KMS, then says it could be SSE-C and gives details about SSE-C only. |
| FU-2 | Fail | Same text as FU-1. |
| FU-3 | Fail | Same text as FU-1. |
