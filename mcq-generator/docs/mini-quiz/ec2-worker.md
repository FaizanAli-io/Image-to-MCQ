# Deploy durable mini-quiz generation on EC2 Ubuntu

The web app and worker run on the **same EC2 instance**, with the same private job directory on persistent EBS storage. This is a single-host queue, not a multi-instance queue. No new npm dependencies are required. Do not enable the flag on ephemeral/serverless storage or several hosts without a shared durable queue design.

## What changes

- With `MINI_QUIZ_BACKGROUND_JOBS=true`, the existing POST endpoint saves the uploaded images locally and returns HTTP 202 with an unguessable job ID.
- A separate Node worker uploads at most three images concurrently to R2, generates the three AO sections concurrently and checkpoints validated sections.
- Each section has at most two API attempts, including after a worker restart. Initial calls allow 120 seconds; the background generation budget is 250 seconds. Successful generations still use three calls. Only failed sections need an extra call. AO1/AO2 question-specific repairs retain neighbouring questions; AO3 repairs the section as a unit because evidence is shared.
- The browser polls short status requests and remembers the pending job in local storage. Reloading reconnects after the job has been accepted. Reconnecting does not start another AI generation.
- One worker processes jobs in submission order. A loopback TCP lock prevents two workers on the host from processing the same queue. Keep the default lock port (48731), or configure the same override for every worker using this queue.
- Jobs/results/checkpoints expire after 24 hours. Sources are deleted from local disk and R2 after completion/failure; failed deletions are retried at expiry. Configure an R2 lifecycle rule for `temp/mini-jobs/` as additional protection if the worker is permanently removed. Job IDs act as bearer credentials: do not publish status URLs or the private job directory.
- A missing worker heartbeat produces a clear 503 response before accepting work. Persistent invalid answers are rejected after recovery; validation is not a scientific-accuracy guarantee.

## Install and enable

The paths below are examples. Replace `/srv/pastpaperpal/mcq-generator` with the existing app checkout, and `ubuntu` with the user running Next.js. Both processes need the same environment and directory permissions. This change does not install or restart any service automatically.

1. Build the web app and worker in the checkout:

   ```sh
   npm ci
   npm run build
   npm run worker:build
   ```

2. Create a persistent private directory, outside the release checkout:

   ```sh
   sudo install -d -o ubuntu -g ubuntu -m 700 /var/lib/pastpaperpal/mini-quiz-jobs
   ```

3. Add these values to the environment used by **both** Next.js and the worker. Keep the existing OpenAI and R2 environment values. Do not expose these as `NEXT_PUBLIC_*` variables.

   ```env
   MINI_QUIZ_JOB_DIR=/var/lib/pastpaperpal/mini-quiz-jobs
   MINI_QUIZ_BACKGROUND_JOBS=true
   ```

4. Install this service as `/etc/systemd/system/pastpaperpal-mini-quiz-worker.service`, editing the checkout, environment-file and Node paths first. Use `command -v node` to find the Node executable; systemd does not load interactive shell/nvm settings. Use the same Node version as the web app.

   ```ini
   [Unit]
   Description=Past Paper Pal mini quiz worker
   After=network-online.target
   Wants=network-online.target

   [Service]
   Type=simple
   User=ubuntu
   Group=ubuntu
   WorkingDirectory=/srv/pastpaperpal/mcq-generator
   EnvironmentFile=/srv/pastpaperpal/mcq-generator/.env.local
   Environment=NODE_ENV=production
   ExecStart=/usr/bin/node /srv/pastpaperpal/mcq-generator/.worker/workers/mini-quiz-worker.js
   Restart=always
   RestartSec=5
   TimeoutStopSec=300
   UMask=0077

   [Install]
   WantedBy=multi-user.target
   ```

5. Start the worker, check it is ready, then restart the existing Next.js service with the updated environment:

   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now pastpaperpal-mini-quiz-worker
   sudo systemctl status pastpaperpal-mini-quiz-worker
   sudo journalctl -u pastpaperpal-mini-quiz-worker -n 50 --no-pager
   ```

   The worker should log `Mini quiz worker ready`. Keep Cloudflare/proxy caching disabled for `/api/*`. The initial upload still needs to fit the proxy's body-size/upload-time limits; background jobs remove the long generation wait, not the file-upload request itself.

## Staging acceptance checks

Use a staging environment with a separate `MINI_QUIZ_JOB_DIR` before production:

1. Generate GCSE and A-level quizzes from the same notes; verify the POST returns 202, status calls are short, the PDF and answer numbering are unchanged.
2. Upload ten typical screenshots. Verify the job completes and progress reaches 3/3.
3. Reload the page while generating; it should reconnect to the same job, with no second POST.
4. Restart the worker after at least one section completes. Confirm that completed sections are reused (inspect attempt logs), and the job finishes or reports a bounded recovery failure. A call interrupted before checkpointing may need its remaining attempt.
5. Stop the worker. New jobs should receive the temporary-unavailability message rather than wait forever. Start it again and confirm normal generation.
6. Verify retrieval generation and topic mapping still behave as before. Confirm sources are removed on both success and failure.

## Subsequent releases and rollback

Stop the worker gracefully before replacing `.worker` build files, rebuild it with `npm run worker:build`, then restart it alongside the updated Next.js app. Do not delete `/var/lib/pastpaperpal/mini-quiz-jobs` during deployments. Checkpoints remain through process restarts; loss of the underlying disk still requires infrastructure recovery.

To roll back the queue, set `MINI_QUIZ_BACKGROUND_JOBS=false` in Next.js and restart the web service. Leave the worker running until already accepted jobs finish/expire; the status endpoint still serves them. The synchronous path retains the schema/marking fixes and bounded recovery, with a 165-second total route budget inside the declared 180-second duration. It is still subject to any shorter proxy limit.
