export interface ProgressData {
    progress: number;
    totalPackets: number;
    timestamp: Date;
}
export declare type ProgressEventCallback = (id: string, progressData: [string, ProgressData][]) => void;
export declare class MQTTMetaData {
    private progressEvent?;
    private progressStore;
    constructor(progressEvent?: ProgressEventCallback | undefined);
    updateProgress(id: string, topic: string, progress: number, total?: number): void;
    finishProgress(id: string, topic: string): void;
    getProgressData(id: string): "" | [string, ProgressData][];
}
//# sourceMappingURL=mqtt-metadata.d.ts.map