interface ProgressData {
    progress: number;
    totalPackets: number;
}
export declare class MQTTMetaData {
    private progressStore;
    constructor();
    updateProgress(id: string, topic: string, progress: number, total?: number): void;
    finishProgress(id: string, topic: string): void;
    getProgressData(id: string): "" | [string, ProgressData][];
}
export {};
//# sourceMappingURL=mqtt-metadata.d.ts.map