interface ProgressData {
    progress: number;
    totalPackets: number;
}
export declare class MQTTMetaData {
    private progressStore;
    constructor();
    initProgress(id: string, topic: string, progress: number, total: number): void;
    updateProgress(id: string, topic: string, progress: number): void;
    getProgressData(id: string): "" | [string, ProgressData][];
}
export {};
//# sourceMappingURL=mqtt-metadata.d.ts.map