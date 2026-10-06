/** Your own name opens My Profile; anyone else's opens their Public Profile (find-people.md §5.3). */
export function profilePath(userId: string, viewerId: string | undefined): string {
  return userId === viewerId ? '/profile' : `/users/${encodeURIComponent(userId)}`;
}
