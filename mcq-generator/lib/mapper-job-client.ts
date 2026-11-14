import type { MapperJobView } from './mapper-job-types';

export class MapperResponseError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function readMapperResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: { error?: string };
  try { data = JSON.parse(text); }
  catch {
    const message = [524, 504, 408].includes(response.status)
      ? 'The connection timed out. Your saved job may still be running; reconnect to check its progress.'
      : `The server returned an unexpected response (HTTP ${response.status}). Please reconnect shortly.`;
    throw new MapperResponseError(message, response.status);
  }
  if (!response.ok) throw new MapperResponseError(data?.error || `Mapper request failed (HTTP ${response.status}).`, response.status);
  return data as T;
}
export function newMapperJobId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function pollMapperJob(id: string, onProgress: (job: MapperJobView) => void, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<MapperJobView> {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid saved mapper job. Please start again.');
  let failures = 0;
  let missing = 0;
  while (!signal.aborted) {
    try {
      const response = await fetcher(`/api/mapper-jobs/${id}`, { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
      const job = await readMapperResponse<MapperJobView>(response);
      if (job.jobId !== id || !['queued', 'running', 'succeeded', 'failed'].includes(job.status)) throw new Error('Invalid mapper progress response.');
      failures = 0;
      onProgress(job);
      if (job.status === 'succeeded' || job.status === 'failed') return job;
    } catch (error) {
      if (signal.aborted) throw error;
      // A refresh can race the upload being committed. Recheck that ID; never
      // resubmit a paid job automatically after a lost upload acknowledgement.
      if (error instanceof MapperResponseError && error.status === 404) {
        if (++missing >= 5) throw error;
      } else if (++failures >= 5 || (error instanceof MapperResponseError && error.status < 500)) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(new DOMException('Polling stopped', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2500);
      signal.addEventListener('abort', abort, { once: true });
    });
  }
  throw new DOMException('Polling stopped', 'AbortError');
}
