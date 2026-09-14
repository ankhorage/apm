/*** Build a collision-resistant internal key for one package declaration owner and name. */
export function declarationResolutionKey(ownerPath: string, name: string): string {
  return `${ownerPath}\u0000${name}`;
}
