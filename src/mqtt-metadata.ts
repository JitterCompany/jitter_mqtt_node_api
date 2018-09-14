type Topic = string;

interface ProgressData {
  progress: number;
  totalPackets: number;
}
type ClientProgressMap = Map<Topic, ProgressData>


export class MQTTMetaData {

  private progressStore = new Map<string, ClientProgressMap>();

  constructor() {

  }

  updateProgress(id: string, topic: string, progress: number, total?: number) {

    // get
    let clientProgress = this.progressStore.get(id);
    if (!clientProgress) {
      clientProgress = new Map<string, ProgressData>();
    }

    const progressData = clientProgress.get(topic);
    clientProgress.set(topic, {
      progress: progress,
      totalPackets: total || (progressData ? progressData.totalPackets : -1)
    });
    this.progressStore.set(id, clientProgress);
  }

  finishProgress(id: string, topic: string) {
    let clientProgress = this.progressStore.get(id);
    if (!clientProgress) {
      clientProgress = new Map<string, ProgressData>();
    }

    const progressData = clientProgress.get(topic);
    clientProgress.set(topic, {
      progress: progressData ? progressData.totalPackets : -1,
      totalPackets: progressData ? progressData.totalPackets : -1
    });
    this.progressStore.set(id, clientProgress);
  }

  getProgressData(id: string) {
    let clientProgress = this.progressStore.get(id);
    if (clientProgress) {
      return [...clientProgress];
    } else {
      return '';
    }
  }
}