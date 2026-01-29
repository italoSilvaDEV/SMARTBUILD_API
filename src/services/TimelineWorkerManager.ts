import { Worker } from 'worker_threads';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CreateTimelineData, BatchCreateTimelineData, TimelineJob } from '../workers/timelineWorker/timelineWorker';

interface WorkerResult {
    jobId: string;
    success: boolean;
    result?: any;
    error?: string;
    processingTime: number;
}

class TimelineWorkerManager {
    private static instance: TimelineWorkerManager;
    private workers: Worker[] = [];
    private currentWorkerIndex = 0;
    private maxWorkers = 2; // Limitando a 2 workers para não sobrecarregar
    private pendingJobs = new Map<string, { resolve: Function, reject: Function, timeout: NodeJS.Timeout }>();
    private jobTimeout = 30000; // 30 segundos de timeout

    static getInstance(): TimelineWorkerManager {
        if (!TimelineWorkerManager.instance) {
            TimelineWorkerManager.instance = new TimelineWorkerManager();
        }
        return TimelineWorkerManager.instance;
    }

    constructor() {
        this.initWorkers();
    }

    private initWorkers(): void {
        const workerPath = path.join(__dirname, '../workers/timelineWorker.js');
        
        for (let i = 0; i < this.maxWorkers; i++) {
            try {
                const worker = new Worker(workerPath);
                
                worker.on('message', (message: WorkerResult) => {
                    this.handleWorkerMessage(message);
                });
                
                worker.on('error', (error) => {
                    this.restartWorker(i);
                });
                
                worker.on('exit', (code) => {
                    if (code !== 0) {
                        this.restartWorker(i);
                    }
                });
                
                this.workers[i] = worker;
                
            } catch (error) {
            }
        }
    }

    private restartWorker(index: number): void {
        try {
            if (this.workers[index]) {
                this.workers[index].terminate();
            }
            
            const workerPath = path.join(__dirname, '../workers/timelineWorker.js');
            const worker = new Worker(workerPath);
            
            worker.on('message', (message: WorkerResult) => {
                this.handleWorkerMessage(message);
            });
            
            worker.on('error', (error) => {
            });
            
            this.workers[index] = worker;
            
        } catch (error) {
        }
    }

    private handleWorkerMessage(message: WorkerResult): void {
        const pendingJob = this.pendingJobs.get(message.jobId);
        
        if (pendingJob) {
            clearTimeout(pendingJob.timeout);
            this.pendingJobs.delete(message.jobId);
            
            if (message.success) {
                pendingJob.resolve(message.result);
            } else {
                pendingJob.reject(new Error(message.error || 'Worker job failed'));
            }
            
        }
    }

    private getNextWorker(): Worker | null {
        if (this.workers.length === 0) {
            return null;
        }
        
        const worker = this.workers[this.currentWorkerIndex];
        this.currentWorkerIndex = (this.currentWorkerIndex + 1) % this.workers.length;
        return worker;
    }

    private executeJob(job: TimelineJob): Promise<any> {
        return new Promise((resolve, reject) => {
            const worker = this.getNextWorker();
            
            if (!worker) {
                reject(new Error('No workers available'));
                return;
            }

            // Configurar timeout
            const timeout = setTimeout(() => {
                this.pendingJobs.delete(job.id);
                reject(new Error(`Job ${job.id} timed out after ${this.jobTimeout}ms`));
            }, this.jobTimeout);

            // Armazenar job pendente
            this.pendingJobs.set(job.id, { resolve, reject, timeout });

            // Enviar job para worker
            worker.postMessage({
                type: 'ADD_JOB',
                job
            });
        });
    }

    // Método principal para criar timeline (assíncrono)
    async createTimeline(data: CreateTimelineData): Promise<any> {
        const job: TimelineJob = {
            id: uuidv4(),
            type: 'CREATE_TIMELINE',
            data,
            userId: data.user_id,
            timestamp: Date.now()
        };

        try {
            const result = await this.executeJob(job);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // Método para criar timelines em lote
    async createTimelineBatch(timelines: CreateTimelineData[]): Promise<any> {
        const job: TimelineJob = {
            id: uuidv4(),
            type: 'BATCH_CREATE_TIMELINE',
            data: { timelines },
            timestamp: Date.now()
        };

        try {
            const result = await this.executeJob(job);
            return result;
        } catch (error) {
            throw error;
        }
    }

    // Método para criar timeline de forma "fire-and-forget" (não aguarda resultado)
    createTimelineAsync(data: CreateTimelineData): void {
        const job: TimelineJob = {
            id: uuidv4(),
            type: 'CREATE_TIMELINE',
            data,
            userId: data.user_id,
            timestamp: Date.now()
        };

        const worker = this.getNextWorker();
        if (worker) {
            worker.postMessage({
                type: 'ADD_JOB',
                job
            });
        } else {
        }
    }

    // Obter estatísticas dos workers
    getStats(): any {
        return {
            activeWorkers: this.workers.length,
            maxWorkers: this.maxWorkers,
            pendingJobs: this.pendingJobs.size,
            currentWorkerIndex: this.currentWorkerIndex
        };
    }

    // Parar todos os workers
    async terminate(): Promise<void> {
        
        // Cancelar jobs pendentes
        for (const [jobId, pendingJob] of this.pendingJobs.entries()) {
            clearTimeout(pendingJob.timeout);
            pendingJob.reject(new Error('Worker manager terminated'));
        }
        this.pendingJobs.clear();

        // Terminar workers
        const terminationPromises = this.workers.map(worker => worker.terminate());
        await Promise.all(terminationPromises);
        
        this.workers = [];
    }
}

export { TimelineWorkerManager }; 