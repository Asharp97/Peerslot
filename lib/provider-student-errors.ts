export class ProviderStudentEmailConflictError extends Error {
  readonly code = "student_email_conflict";

  constructor(public studentName: string) {
    super(`This email already belongs to ${studentName}.`);
    this.name = "ProviderStudentEmailConflictError";
  }
}
