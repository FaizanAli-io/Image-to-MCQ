# Mapper extraction and export checks

The extractor version is `mapper-jobs-v5`. Check `GET /api/extract-questions`
after deployment to confirm that the new code is running.

## Supported worksheet path

For recognised single-column Physics & Maths Tutor question worksheets and
their narrow-column marking tables:

- Read question text in physical page order, retaining parent stems across pages.
- Preserve each numbered source section and its own printed mark allocation.
- Reconstruct wrapped marking identifiers using the table's identifier columns.
- Copy matching marking rows directly, including original guidance and alternatives.
- If a main question has different subpart numbering in the two documents, make
  one bounded AI call to select existing marking rows for that main question only.
  The model cannot generate replacement answer text. These pairings are flagged
  for review. Invalid, duplicate or incomplete matches leave visible review entries.

Other layouts retain the existing AI extraction path. Their coverage is explicitly
reported as unverified; the new reader does not claim to support arbitrary paper
layouts, scans, diagrams or multi-column documents. Graphic-only information is
not transcribed by this text-based workflow.

## Spreadsheet behavior

Both download and email exports use `lib/topic-mapper-export.ts`. The summary
retains the original topic/marks column pairs, without additional Part or Review
Notes columns. Part labels and review reasons remain in Detailed Mappings.

Exports include source questions even if their topic-mapping result is missing.
Source allocations take precedence over marks appearing in inherited context.
Missing allocations, missing expected parts or overlapping parent/child entries
produce `?` for the main total. Known totals stay numeric; coverage warnings
appear in the existing detailed review fields. Nothing is silently filled
in with guessed marks or generated answers.

## Biodiversity regression

The supplied question paper spans Q21–Q53 (33 main questions). The old export
contained only 20 main questions. The source reader retains 84 numbered sections,
including the unmarked introductory Q26(a) section so that it remains reviewable.

Known totals checked against the question paper:

| Question | Old export | Source total |
| --- | ---: | ---: |
| Q24 | 4 | 13 |
| Q25 | 14 | 8 |
| Q51 | 5 | 7 |

The original PDFs themselves have two issues requiring review:

- Q26 has different subpart labels in the QP and MS. The QP's (a) is an unmarked
  introductory statement, followed by (b)(i); the MS begins at (a)(i).
- Q27(iii) has no printed mark allocation in the supplied QP.

These questions must not receive an invented, apparently verified total.
Source PDFs, diagnostic files and live-test spreadsheets stay in ignored
`.tmp-qa/mapper-review`; they are not included in the deployed app.

## Deployment and checks

### Local testing must use the local extractor

The November 7 local spreadsheet contained only 20 main questions because the
local browser used `NEXT_PUBLIC_API_BASE_URL` to call the older production API.
A direct test of the local extractor had bypassed that browser routing. This was
not evidence that the latest extractor had been deployed and failed in production.

Both development and production now use same-origin API routes. The mapper ignores
`NEXT_PUBLIC_API_BASE_URL`, so no environment-file edit is required. On the live
website, extraction and mapping use `https://quizgenerator.pastpaperpal.co.uk/api/`;
locally they use localhost. There is no fallback to the separately deployed
`api.pastpaperpal.co.uk` service. Before any PDF upload, a read-only version check
requires `mapper-jobs-v5`; the extraction response is checked too. An unavailable
or incompatible service produces a deployment message before mapping/export,
instead of silently processing an old extractor's partial result.

Restart `npm run dev` and refresh the mapper page for a new local test. In the
browser Network panel, `/api/extract-questions` and `/api/map-questions` must use
the localhost origin. A GET to `/api/extract-questions` must include
`"extractionVersion":"mapper-jobs-v5"` and `"workerAvailable":true`.
These checks do not call OpenAI.

## Background worker deployment (required for this release)

The mapper now runs extraction and topic mapping as durable jobs. POST uploads
return HTTP 202 with a job ID; the browser polls GET /api/mapper-jobs/[id].
The web app and the separate mapper worker must share one private directory on
this EC2 instance's persistent EBS disk. This is a single-host queue, not a
multi-instance or serverless queue. No database or new npm dependency is required.

Existing extraction prompts, matching rules, topic classification and spreadsheet
formatting are reused unchanged. Completed AI responses and individual mapped
questions are checkpointed. Refreshing reconnects to the saved job, without a new
AI request. If the worker crashes during an unsaved API call, that call can repeat;
a job can resume once and each identical AI request has at most two worker-level
attempts (in addition to the SDK's existing request retry policy). A worker run
has a 30-minute processing budget; jobs/results expire after 24 hours.

PDFs, request caches and mapping input are removed after success/failure. Results
remain private for up to 24 hours, then the running worker removes them. Job IDs
are bearer tokens: do not publish them or expose the job directory via Nginx.
Cleanup requires the worker to be running. The worker uses a separate singleton
lock on loopback port 48732; the mini-quiz worker remains separate and unchanged.

### First deployment on your EC2 instance

Commit and push first. On EC2:

~~~sh
cd /home/ubuntu/apps/Image-to-MCQ/mcq-generator
git pull --ff-only origin main
sudo install -d -o ubuntu -g ubuntu -m 700 /var/lib/pastpaperpal/mapper-jobs
nano .env
~~~

Add this line to the existing **.env** file, keeping the existing credentials:

~~~env
MAPPER_JOB_DIR=/var/lib/pastpaperpal/mapper-jobs
~~~

Then build and start the new mapper worker **for the first time**:

~~~sh
(
  set -e
  cd /home/ubuntu/apps/Image-to-MCQ/mcq-generator
  npm ci
  npm run build
  npm run mapper:build
  pm2 start .mapper-worker/workers/mapper-worker.js --name mapper-worker --node-args="--env-file=.env" --kill-timeout 30000
  pm2 restart mcq-generator --update-env
  pm2 save
)
~~~

Do not stop or restart a mapper-worker process before its first start. Do not
restart the mini-quiz worker for this mapper-only change. The mapper has its own
build directory (.mapper-worker); it does not replace .worker.

Verify startup:

~~~sh
pm2 list
pm2 logs mapper-worker --lines 30 --nostream
curl -fsS https://quizgenerator.pastpaperpal.co.uk/api/extract-questions
~~~

The worker should log **Mapper worker ready**. The GET response must contain:

~~~json
{"extractionVersion":"mapper-jobs-v5","backgroundJobs":true,"workerAvailable":true}
~~~

If workerAvailable is false, check mapper-worker logs and ensure both processes
use the same MAPPER_JOB_DIR and can read/write it. If the version is old, check
the PM2 working directory/build and Nginx upstream. Refresh the browser after
updating. POST /api/extract-questions and POST /api/map-questions should now return
202 quickly; long-running work belongs to the worker, not those HTTP requests.
Keep Cloudflare/Nginx caching disabled for /api/*. Uploads still need to fit proxy
body-size and upload-time limits; queued processing removes the long response wait.

### Later mapper deployments

Once mapper-worker already exists:

~~~sh
(
  set -e
  cd /home/ubuntu/apps/Image-to-MCQ/mcq-generator
  git pull --ff-only origin main
  pm2 stop mapper-worker
  npm ci
  npm run build
  npm run mapper:build
  pm2 restart mapper-worker --update-env
  pm2 restart mcq-generator --update-env
  pm2 save
)
~~~

The 30-second stop grace period allows short work to finish. An interrupted
in-flight request may repeat after restart; completed checkpoints are reused.
Do not delete the job directory during deployment. If a build fails after stopping
the worker, resolve the build failure before restarting it. Rollback requires a
matching web/worker build; old completed results remain readable for their TTL.

### Local development

In separate terminals from mcq-generator:

~~~sh
npm run mapper:build
node --env-file=.env.local .mapper-worker/workers/mapper-worker.js
~~~

~~~sh
npm run dev
~~~

Use .env instead if that is your local environment file. Both processes must have
the same MAPPER_JOB_DIR (or both use the default .mapper-jobs in this directory).

### Validation

~~~sh
node --test --test-reporter=dot tests/*.test.cjs
npm run mapper:build
npm run build
~~~

Tests cover durable acknowledgement, same-ID retry, worker availability, safe job
paths, response checkpoints, question-level resume, HTML timeout errors and
reconnecting without resubmission, in addition to the existing extraction/export
regressions. A local smoke test can use synthetic numbered PDF worksheets and
calculation questions to exercise both jobs without paid AI calls. No production
files or emails need to be sent for this check.
