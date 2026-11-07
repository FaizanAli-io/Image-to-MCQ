// Shared by the browser and extractor so a new UI cannot silently consume an
// older backend's incomplete extraction response after a partial deployment.
export const MAPPER_EXTRACTION_VERSION = 'source-layout-v4';

export function assertMapperExtractionVersion(version: unknown): void {
  if (version !== MAPPER_EXTRACTION_VERSION) {
    throw new Error('The mapper update is not active on the server. Please contact support so the updated extraction service can be deployed. Retrying these PDFs will not fix the server version.');
  }
}
