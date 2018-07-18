
export interface MQTTClient {
    _id: string; // username
    topics: string; // _id of MQTTTopic
    password?: string;
}

type TopicMap = Map<string, string>;

export interface MQTTTopic {
    _id?: string;
    topics: TopicMap;
}
