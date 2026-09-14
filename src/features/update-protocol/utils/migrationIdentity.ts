/*** Build the stable owner-scoped identity used by migration graphs and plans. */
export function migrationIdentity(owner: string, migrationId: string): string {
  return `${owner}:${migrationId}`;
}
