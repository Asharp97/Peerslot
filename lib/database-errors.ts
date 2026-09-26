export function isPostgresError(
  error: unknown,
  code: string,
  constraint?: string,
): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if (
    "code" in error &&
    error.code === code &&
    (!constraint || ("constraint" in error && error.constraint === constraint))
  ) {
    return true;
  }

  return "cause" in error && isPostgresError(error.cause, code, constraint);
}
