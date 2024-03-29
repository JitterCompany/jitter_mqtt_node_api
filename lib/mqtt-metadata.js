"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MQTTMetaData = void 0;
class MQTTMetaData {
    constructor(progressEvent) {
        this.progressEvent = progressEvent;
        this.progressStore = new Map();
    }
    updateProgress(id, topic, progress, total) {
        // get
        let clientProgress = this.progressStore.get(id);
        if (!clientProgress) {
            clientProgress = new Map();
        }
        const progressData = clientProgress.get(topic);
        clientProgress.set(topic, {
            progress: progress,
            totalPackets: total || (progressData ? progressData.totalPackets : -1),
            timestamp: new Date()
        });
        this.progressStore.set(id, clientProgress);
        if (this.progressEvent) {
            const data = this.getProgressData(id);
            if (data) {
                this.progressEvent(id, data);
            }
        }
    }
    finishProgress(id, topic) {
        let clientProgress = this.progressStore.get(id);
        if (!clientProgress) {
            clientProgress = new Map();
        }
        const progressData = clientProgress.get(topic);
        clientProgress.set(topic, {
            progress: progressData ? progressData.totalPackets : -1,
            totalPackets: progressData ? progressData.totalPackets : -1,
            timestamp: new Date()
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