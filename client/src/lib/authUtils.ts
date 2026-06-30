export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// Returns true if the user has admin privileges.
// Checks the DB role; falls back to the bootstrap email.
export function isAdminUser(user: any): boolean {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    user.email === 'timtheeuwsen@gmail.com'
  );
}
