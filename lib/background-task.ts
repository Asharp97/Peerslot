import { after } from "next/server";

type BackgroundTask = () => void | Promise<unknown>;

/**
 * Run work after a response when Next provides a request scope, while keeping
 * auth and integration tests usable when Better Auth is invoked directly.
 */
export function runAfterResponse(task: BackgroundTask, label: string) {
  const execute = () => {
    void Promise.resolve()
      .then(task)
      .catch((error: unknown) => {
        console.error("background_task_failed", {
          error: error instanceof Error ? error.message : "unknown",
          label,
        });
      });
  };

  try {
    after(execute);
  } catch {
    execute();
  }
}
