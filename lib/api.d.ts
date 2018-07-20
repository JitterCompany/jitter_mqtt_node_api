/// <reference types="node" />
import { MQTTClient, MQTTTopic, TopicReturnMessage, TopicHandlers } from './mqtt.model';
import { MQTTWorker } from './mqtt-protocol';
export declare type TopicHandlerWorker = (username: string, payload?: Buffer, worker?: MQTTWorker) => TopicReturnMessage;
export declare class MQTTAPI {
    private clientCollection;
    private topicCollection;
    private handlers;
    private mqtt_client;
    private topicMap;
    private workers;
    constructor(clientCollection: Mongo.Collection<MQTTClient>, topicCollection: Mongo.Collection<MQTTTopic>, broker_url: string, handlers: TopicHandlers);
    private getWorker;
    private topicDispatch;
    hi_protocol_handler: (username: string, payload: Buffer, worker: MQTTWorker) => void;
    register_protocol_handler: (clientID: string) => void;
    private verify_protocol_handler;
    private createHandlerMap;
    private prepareBrokerDatabase;
    insertNewClient(clientID: string, credentials: any): void;
}
//# sourceMappingURL=api.d.ts.map