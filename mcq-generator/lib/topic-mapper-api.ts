/** Use the configured API host in both development and production. */
export function getTopicMapperApiUrl(path: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim().replace(/\/+$/, '');
  return `${baseUrl}${path}`;
}
