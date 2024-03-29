type Topic = string;

export interface ProgressData {
  progress: number;
  totalPackets: number;
  timestamp: Date;
}
type ClientProgressMap = Map<Topic, ProgressData>

export type ProgressEventCallback =  (id: string, progressData: [string, ProgressData][]) => void;


export class MQTTMetaData {

  private progressStore = new Map<string, ClientProgressMap>();

  constructor(
    private progressEvent?: ProgressEventCallback
  ) {

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

  finishProgress(id: string, topic: string) {
    let clientProgress = this.progressStore.get(id);
    if (!clientProgress) {
      clientProgress = new Map<string, ProgressData>();
    }

    const progressData = clientProgress.get(topic);
    clientProgress.set(topic, {
      progress: progressData ? progressData.totalPackets : -1,
      totalPackets: progressData ? progressData.totalPackets : -1,
      timestamp: new Date()
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