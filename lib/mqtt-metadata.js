"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class MQTTMetaData {
    constructor() {
        this.progressStore = new Map();
    }
    initProgress(id, topic, progress, total) {
        let clientProgress = this.progressStore.get(id);
        if (!clientProgress) {
            clientProgress = new Map();
        }
        clientProgress.set(topic, {
            progress: progress,
            totalPackets: total
        });
        this.progressStore.set(id, clientProgress);
    }
    updateProgress(id, topic, progress) {
        // get
        let clientProgress = this.progressStore.get(id);
        if (!clientProgress) {
            clientProgress = new Map();
        }
        const progressData = clientProgress.get(topic);
        clientProgress.set(topic, {
            progress: progress,
            totalPackets: progressData ? progressData.totalPackets : -1
        });
        this.progressStore.set(id, clientProgress);
    }
    getProgressData(id) {
        let clientProgress = this.progressStore.get(id);
        if (clientProgress) {
            return [...clientProgress];
        }
        else {
            return '';
        }
    }
}
exports.MQTTMetaData = MQTTMetaData;
//# sourceMappingURL=mqtt-metadata.js.map