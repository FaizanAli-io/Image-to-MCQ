# Mini quiz prompt integration

The current authority is the user's pasted prompt attachment, preserved byte-for-byte in [client-prompts.txt](client-prompts.txt).

## Exact prompts and question counts

The AO2 and AO3 getters return the complete supplied text for each level, without number replacement, trimming, appended instructions, or truncated output/developer sections. Regression tests compare every character with the attachment. The canonical attachment's CRLF bytes are protected by .gitattributes.

- GCSE: 10 AO1 + 6 AO2 + 3 AO3 = 19 questions.
- A-level: 8 AO1 + 6 AO2 + 6 AO3 = 20 questions; AO3 starts at Q15.

The model receives each client prompt as its own unmodified text block. Separate JSON transport instructions map its output into the app. They do not replace the assessment-objective definitions. The AO3 developer specification and type check are represented in private fields; exact stimulus contents are stored once in the structured stimuli array.

## Generation and validation

Three section requests start in parallel on gpt-5.4-2026-03-05, with low reasoning for all sections. Each sees both images when two are supplied. AO2 and AO3 therefore receive their own full prompts, without a competing assessment objective in the same request.

No additional source-quote or application-planning instructions are appended to the client prompts. AO3 includes the stimulus specifications and type check requested by the original prompt, encoded as JSON for rendering. These are part of generation, not separate AI review calls.

The application validates each section's local mark-scheme numbering, combines sections in AO1/AO2/AO3 order, assigns global numbering, and removes explicit local number prefixes from question text. It never asks an AI to transfer or renumber answers.

Every section's displayed marks are calculated from distinct one-mark points. Missing marking entries, duplicate question numbers, duplicate literal points, and unsupported mark allocations fail validation. The code never pads a mark scheme with invented answers to match a model-supplied total. Semantic duplication or flawed reasoning still requires content inspection.

AO3 validation checks taxonomy, stimulus references, chart bounds, axes, error bars, table shapes, and missing evidence. This is structural validation, not scientific verification. There are no automatic AI review or repair calls, no SDK retries, and a 75-second timeout per request. All requests settle before uploaded pages are removed. The route allows 90 seconds; deployment limits and API latency still need monitoring.

## Presentation

The October client feedback is supplied separately in `mini-quiz-client-requirements.ts`; the four original prompt bodies remain unchanged. Every AO3 question must reference supplied evidence, including GCSE questions. A-level requires three distinct stimuli used twice each and at least three primary reasoning types. Counted responses are grouped against marking points to catch mismatched response counts and missing explanation allocations. Generation instructions require established conditions for predictions. These checks cannot determine whether an answer is scientifically correct.

Mini-quiz exports use `Topic - GCSE/A-LEVEL - Mini Quiz.pdf`. The AO1, AO2 and AO3 PNGs in `public/data` appear beside their respective mark-scheme headings, with text flowing beside and then below each image. Scientific text uses formula subscripts, superscript exponents, Greek symbols and reaction arrows in questions, marking points and stimuli.

The PDF derives section lengths from the actual AO labels instead of assuming 24 A-level questions. All sections show marks and paginate marking points line by line. Shared evidence is drawn once, with page references when reused. Private developer specifications and type checks are excluded from student output. The API reports reviewStatus=not_run rather than claiming an AI quality check passed.

Supported stimuli: tables, written evidence, line/scatter/grouped-bar graphs, optional explained error bars, and simple GCSE apparatus/geometric schematics. Graph points, fits and bounds must be explicitly supplied; the renderer does not invent evidence. A-level diagrams remain excluded by the client prompt. The GCSE prompt is preserved in full, but the production renderer still cannot create arbitrary biological illustrations; the separate transport adapter states that limitation.

## Verification

From mcq-generator:

    node --test tests/*.test.cjs
    npx tsc --noEmit

The tests cover exact prompt text and actual request payloads, counts, source images in all requests, concurrent request completion, local-to-global numbering, marking totals, malformed output, graph/table contracts, private metadata removal, and real PDF pagination. Retrieval regressions are included.

Opt-in live test (uses the configured API key, makes paid requests):

    node --env-file=.env.local tests/mini-quiz-live.cjs A-LEVEL page1.png page2.png output-directory

The live script saves raw section responses, timings, assembled questions, and a combined quiz/mark-scheme PDF. Keep generated outputs in an ignored directory such as ../.tmp-qa/mini/.

## Verification limits

Manual spot checks during development found recall-like questions and explanations using knowledge outside the supplied pages. Some A-level AO3 requests also reached the 75-second timeout. Exact prompt matching and structural checks do not certify scientific quality or guarantee latency. The final simplification to the exact client prompts was covered by automated tests but was not followed by another paid live run.
