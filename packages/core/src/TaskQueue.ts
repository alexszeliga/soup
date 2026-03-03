import { eq } from 'drizzle-orm';
import { DatabaseInstance } from '@soup/database';
import { tasks as tasksSchema } from '@soup/database/schema.js';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed';

/**
 * Interface representing a generic unit of work that can be queued.
 */
export interface Task {
  id: string;
  torrentHash: string;
  status: TaskStatus;
  progress: number;
  run(onProgress: (p: number) => void): Promise<void>;
  /** Must return a DB-serializable representation of the task. */
  toJSON(): any;
}

/**
 * A serial task queue that executes tasks one by one and persists state to DB.
 */
export class TaskQueue {
  private tasks: Task[] = [];
  private isProcessing = false;

  /**
   * Creates an instance of TaskQueue.
   * 
   * @param db - The database instance for persistence.
   */
  constructor(private readonly db: DatabaseInstance) {}

  /**
   * Adds a new task to the queue and persists it to the database.
   * 
   * @param task - The task to enqueue.
   */
  public enqueue(task: Task): void {
    this.tasks.push(task);
    
    // Persist to DB
    const data = task.toJSON();
    this.db.insert(tasksSchema).values({
      id: task.id,
      torrentHash: task.torrentHash,
      type: 'copy', // Default for now
      status: task.status,
      progress: task.progress,
      fileMap: data.fileMap || '{}',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }).run();

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
      this.updateTaskStatus(nextTask, 'processing');
      
      await nextTask.run((progress) => {
        // Debounce DB updates if needed, but for now simple sync
        this.updateTaskProgress(nextTask, progress);
      });

      this.updateTaskStatus(nextTask, 'completed');
    } catch (err) {
      console.error(`Task ${nextTask.id} failed:`, err);
      this.updateTaskStatus(nextTask, 'failed', (err as Error).message);
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  private updateTaskStatus(task: Task, status: TaskStatus, error?: string): void {
    task.status = status;
    this.db.update(tasksSchema)
      .set({ status, errorMessage: error, updatedAt: Date.now() })
      .where(eq(tasksSchema.id, task.id))
      .run();
  }

  private updateTaskProgress(task: Task, progress: number): void {
    task.progress = progress;
    this.db.update(tasksSchema)
      .set({ progress, updatedAt: Date.now() })
      .where(eq(tasksSchema.id, task.id))
      .run();
  }
}
