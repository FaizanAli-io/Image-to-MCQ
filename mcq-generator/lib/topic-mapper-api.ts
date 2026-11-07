import { MAPPER_EXTRACTION_VERSION } from './topic-mapper-contract';

export function getTopicMapperApiUrl(path: string): string {
  // The mapper and its API ship in the same Next.js deployment. Relative URLs
  // resolve to quizgenerator.pastpaperpal.co.uk in production and localhost
  // in development; an old external API environment value cannot override it.
  return path;
}

/** Check the deployed extractor before uploading PDFs. Never fall back to a
 * separately deployed API or retry a paid extraction on another host. */
export async function resolveTopicMapperApiBase(fetcher: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetcher(getTopicMapperApiUrl('/api/extract-questions'), {
      cache: 'no-store', signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.extractionVersion === MAPPER_EXTRACTION_VERSION) return '';
    }
  } catch {
    // Report the unavailable service without uploading to another backend.
  }
  throw new Error('The updated mapper extraction service is unavailable. Please contact support to check the server deployment. No PDFs were uploaded.');
}
