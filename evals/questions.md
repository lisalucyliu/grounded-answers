| ID | Question | Expected |
| --- | --- | --- |
| F1 | What server-side encryption options can I use for S3 objects? | Full |
| F2 | If I turn on versioning for a bucket, can I turn it off again later? | Full |
| F3 | Am I charged for every version of an object in a versioned bucket? | Full |
| F4 | What do I need to set up before S3 replication works? | Full |
| F5 | When I export a Data Exchange revision to S3, which encryption can I apply to the exported files? | Full |
| P1 | How do I replicate objects that already exist in my bucket to a bucket in another Region? | Full |
| P2 | How do I add tags with TagResource? | Full |
| P3 | Does S3 replication copy objects encrypted with SSE-KMS, and what extra setup does that need? | Full |
| P4 | If I suspend versioning, what happens to the versions already in my bucket? | Full |
| P5 | I accepted a data grant. How do I get its files into my S3 bucket? | Full |
| N1 | What does S3 Standard storage cost per GB in us-east-1? | None |
| N2 | How long does a Data Exchange export job take for a 50 GB revision? | None |
| N3 | Can I export a Data Exchange revision straight to Google Cloud Storage? | Full (the answer is no) |
| N4 | How many tags can I add to a Data Exchange data set? | None |
| N5 | Do I need DSSE-KMS to be HIPAA compliant? | None (check after grading) |

Expected was corrected on Oct 26 after the AWS baseline run. AWS gave full answers to all 5 questions first marked Partly.

The 25 sections in `data/docs.json` were picked with these questions in view. 19 hold answers. The cost example section is there for N1: it has a price for S3 Standard but names no Region. These 6 sections hold no answer to any question, so Claude has to choose what to cite:
- `UsingKMSEncryption-bucket-keys`: Amazon S3 Bucket Keys
- `s3-batch-replication-completion-report`: Batch Replication completion report
- `replication-kms-sse-c`: Replicating objects encrypted with SSE-C
- `dx-revision-export-keypatterns`: Key patterns when exporting asset revisions from AWS Data Exchange
- `dx-auto-export`: Automatically exporting AWS Data Exchange asset revisions to an S3 bucket as a subscriber
- `dx-auto-export-console`: Automatically exporting revisions to an S3 bucket as a subscriber (console)

Follow-up test FU: ask F1, wait for the full response, then ask "Tell me more about the third one." in the same chat. Pass = the response names DSSE-KMS and answers about it.
