import process from 'node:process';

/*** Return whether Bun package metadata allows the package to be absent on the current host. */
export function isBunPackageOptionalOnCurrentHost(
  metadata: Readonly<Record<string, unknown>>,
): boolean {
  return (
    metadata.optional === true ||
    constraintExcludesCurrentHost(metadata.os, process.platform) ||
    constraintExcludesCurrentHost(metadata.cpu, process.arch)
  );
}

/*** Evaluate npm-style positive and negative platform constraints without executing package code. */
function constraintExcludesCurrentHost(value: unknown, current: string): boolean {
  const constraints =
    typeof value === 'string'
      ? [value]
      : Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? value
        : [];
  if (constraints.length === 0) return false;
  const excluded = constraints.filter((item) => item.startsWith('!')).map((item) => item.slice(1));
  if (excluded.includes(current) || excluded.includes('*')) return true;
  const allowed = constraints.filter((item) => !item.startsWith('!') && item !== '*');
  return allowed.length > 0 && !allowed.includes(current);
}
