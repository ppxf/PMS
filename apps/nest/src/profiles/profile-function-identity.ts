/** Ignore only Vite-style millisecond cache timestamps on source modules.
 * Keep raw resources for display and preserve all module-semantic parameters.
 */
export function normalizeProfileResource(
  resource: string | undefined,
): string | null {
  if (resource == null) return null;
  const hashIndex = resource.indexOf('#');
  const hash = hashIndex < 0 ? '' : resource.slice(hashIndex);
  const source = hashIndex < 0 ? resource : resource.slice(0, hashIndex);
  const queryIndex = source.indexOf('?');
  if (queryIndex < 0) return resource;
  const path = source.slice(0, queryIndex);
  if (!/\.(?:vue|svelte|[cm]?[jt]sx?)$/.test(path)) return resource;
  const parameters = source.slice(queryIndex + 1).split('&');
  const kept = parameters.filter((parameter) => !/^t=\d{13}$/.test(parameter));
  if (kept.length === parameters.length) return resource;
  return path + (kept.length ? '?' + kept.join('&') : '') + hash;
}
