export interface MQTTClient {
    _id: string;
    topics: string;
    password?: string;
    clientID: string;
    verified: boolean;
}
declare type TopicMap = Map<string, string>;
export interface MQTTTopic {
    _id?: string;
    topics: TopicMap;
}
export {};
//# sourceMappingURL=mqtt.model.d.ts.map