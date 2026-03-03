import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue, Task, TaskStatus } from '../TaskQueue.js';

// A simple mock task for testing the queue logic
class MockTask implements Task {
  public id = Math.random().toString();
  public status: TaskStatus = 'queued';
  public progress = 0;
  
  constructor(private duration: number = 100, public shouldFail: boolean = false) {}

  async run(onProgress: (p: number) => void): Promise<void> {
    this.status = 'processing';
    if (this.shouldFail) {
      throw new Error('Task failed');
    }
    
    // Simulate work
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, this.duration / 10));
      this.progress = i * 10;
      onProgress(this.progress);
    }
    this.status = 'completed';
  }
}

describe('TaskQueue', () => {
  let queue: TaskQueue;

  beforeEach(() => {
    queue = new TaskQueue();
  });

  it('should run tasks in sequence', async () => {
    const task1 = new MockTask(50);
    const task2 = new MockTask(50);
    const runSpy1 = vi.spyOn(task1, 'run');
    const runSpy2 = vi.spyOn(task2, 'run');

    queue.enqueue(task1);
    queue.enqueue(task2);

    // Wait for everything to finish
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (queue.getTasks().every((t: Task) => t.status === 'completed')) {
          clearInterval(interval);
          resolve(true);
        }
      }, 10);
    });

    expect(runSpy1).toHaveBeenCalled();
    expect(runSpy2).toHaveBeenCalled();
  });

  it('should report progress updates', async () => {
    const task = new MockTask(50);
    let lastProgress = 0;
    
    queue.enqueue(task);
    
    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (task.progress > lastProgress) lastProgress = task.progress;
        if (task.status === 'completed') {
          clearInterval(interval);
          resolve(true);
        }
      }, 5);
    });

    expect(lastProgress).toBe(100);
  });

  it('should handle failed tasks and continue queue', async () => {
    const failTask = new MockTask(50, true);
    const successTask = new MockTask(50);
    
    queue.enqueue(failTask);
    queue.enqueue(successTask);

    await new Promise(resolve => {
      const interval = setInterval(() => {
        if (successTask.status === 'completed') {
          clearInterval(interval);
          resolve(true);
        }
      }, 10);
    });

    expect(failTask.status).toBe('failed');
    expect(successTask.status).toBe('completed');
  });
});
