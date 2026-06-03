export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// Returns true if the user has admin privileges.
// Checks DB role fields; falls back to the bootstrap email.
export function isAdminUser(user: any): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    (user.userRoles || []).includes('admin') ||
    user.email === 'timtheeuwsen@gmail.com'
  );
}