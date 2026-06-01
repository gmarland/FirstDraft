import type { WorkerRegistration } from "../../../types/api";

export function getWorkerTaskSlots(worker: WorkerRegistration) {
  const activeTaskCount =
    worker.activeTaskCount ??
    worker.activeTransactionIds?.length ??
    (worker.currentTransactionId ? 1 : 0);

  return {
    activeTaskCount,
    maxConcurrentTasks: worker.maxConcurrentTasks ?? null,
    maxConcurrentTasksLabel: worker.maxConcurrentTasks == null ? "unlimited" : worker.maxConcurrentTasks.toString(),
  };
}
