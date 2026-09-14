/*** Validate an APM protocol package-relative path or export subpath without traversal. */
export function isProtocolPackageSubpath(value: string): boolean {
  if (!value.startsWith('./') || value.length <= 2 || value.includes('\\')) return false;
  const segments = value.slice(2).split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}
