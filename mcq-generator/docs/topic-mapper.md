# Mapper extraction and export checks

The extractor version is `source-layout-v4`. Check `GET /api/extract-questions`
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
requires `source-layout-v4`; the extraction response is checked too. An unavailable
or incompatible service produces a deployment message before mapping/export,
instead of silently processing an old extractor's partial result.

Restart `npm run dev` and refresh the mapper page for a new local test. In the
browser Network panel, `/api/extract-questions` and `/api/map-questions` must use
the localhost origin. A GET to `/api/extract-questions` must return
`{"extractionVersion":"source-layout-v4"}`. These checks do not call OpenAI.

Deploy with the normal app pull/install/build/PM2 restart sequence. No queue,
worker, environment-variable or database change is needed for this mapper change.
Mini-quiz and retrieval generation are not part of this change.

### EC2 commands for this mapper release

After committing and pushing the changes, run this block on EC2. The subshell
stops on any failure so a failed build does not trigger a restart:

```sh
(
  set -e
  cd /home/ubuntu/apps/Image-to-MCQ/mcq-generator
  git pull --ff-only origin main
  npm ci
  npm run build
  pm2 restart mcq-generator --update-env
  pm2 save
)
```

Then verify the public route before testing another upload:

```sh
curl -fsS https://quizgenerator.pastpaperpal.co.uk/api/extract-questions
```

Expected: `{"extractionVersion":"source-layout-v4"}`. If it still returns
`document-batches-v3`, check the running app's build and any Nginx `/api/` upstream;
do not assume a successful frontend load proves the API was updated. Refresh the
mapper page after deployment. This mapper-only release does not change the
mini-quiz worker, so its build or restart is not required.

Offline checks:

```sh
node --test --test-reporter=dot tests/*.test.cjs
npm run build
```

The regression tests cover question order, wrapped IDs, cross-page continuations,
unknown allocations, shifted MS numbering, failed matching, missing mapping rows,
parent/child double counting and XLSX read/write round trips.
