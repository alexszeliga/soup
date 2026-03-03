export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Interface representing a generic unit of work that can be queued.
 */
export interface Task {
  id: string;
  status: TaskStatus;
  progress: number;
  run(onProgress: (p: number) => void): Promise<void>;
}

/**
 * A serial task queue that executes tasks one by one.
 * 
 * Provides a central hub for managing long-running background operations 
 * like file copies, ensuring system stability by limiting concurrency.
 */
export class TaskQueue {
  private tasks: Task[] = [];
  private isProcessing = false;

  /**
   * Adds a new task to the queue and starts processing if idle.
   * 
   * @param task - The task to enqueue.
   */
  public enqueue(task: Task): void {
    this.tasks.push(task);
    this.processNext();
  }

  /**
   * Returns a list of all tasks currently in the queue.
   * 
   * @returns Array of tasks.
   */
  public getTasks(): Task[] {
    return [...this.tasks];
  }

  /**
   * Internal orchestrator that picks the next queued task and runs it.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;

    const nextTask = this.tasks.find(t => t.status === 'queued');
    if (!nextTask) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    
    try {
      await nextTask.run(() => {
        // Progress updates are handled by the task itself, 
        // but the queue could broadcast them here if needed.
      });
    } catch (err) {
      console.error(`Task ${nextTask.id} failed:`, err);
      nextTask.status = 'failed';
    } finally {
      this.isProcessing = false;
      // Continue to next even if one fails
      this.processNext();
    }
  }
}
