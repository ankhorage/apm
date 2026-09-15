/*** Parse Bun lock instance paths without confusing scoped names with nesting or permitting traversal. */
export function parseBunPackagePath(key: string): readonly string[] | undefined {
  const names = key.match(/(?:@[^/]+\/)?[^/]+/gu) ?? [];
  return names.length > 0 && names.join('/') === key && names.every(isPackageName)
    ? names
    : undefined;
}

/*** Accept only safe npm name segments used by Bun's lockfile placement keys. */
function isPackageName(name: string): boolean {
  const parts = name.startsWith('@') ? name.slice(1).split('/') : [name];
  return (
    parts.length === (name.startsWith('@') ? 2 : 1) &&
    parts.every((part) => /^[a-zA-Z0-9_~][a-zA-Z0-9._~-]*$/u.test(part))
  );
}
