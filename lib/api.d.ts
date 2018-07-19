/// <reference types="node" />
import * as mqtt from 'mqtt';
import { MQTTWorker } from './mqtt-protocol';
export interface TopicReturnDescriptor {
    topicname: string;
    message: Buffer;
}
declare type TopicReturnMessage = string | Buffer | TopicReturnDescriptor[] | undefined | void;
export declare type TopicHandler = (username: string, payload?: Buffer) => TopicReturnMessage;
export declare type TopicHandlerWorker = (username: string, payload?: Buffer, worker?: MQTTWorker) => TopicReturnMessage;
declare type TopicType = "fixeddata" | "normal";
export interface TopicDescriptor {
    topicName: string;
    type?: TopicType;
}
export interface TopicMap {
    [topicName: string]: TopicHandlerWorker;
}
export interface TopicHandlers {
    topic_hi: (username: string, wantsOffline: boolean) => boolean;
    topic_bye: TopicHandler;
    topic_register: TopicHandler;
    topic_verify: TopicHandler;
    topic_list: TopicDescriptor[];
}
export declare class MQTTAPI {
    private clientCollection;
    private topicCollection;
    private handlers;
    private mqtt_client;
    private topicMap;
    private workers;
    constructor(clientCollection: Mongo.Collection<{}>, topicCollection: Mongo.Collection<{}>, broker_url: string, handlers: TopicHandlers);
    private getWorker;
    private topicDispatch;
    hi_protocol_handler: (username: string, payload: Buffer, worker: MQTTWorker) => void;
    private createHandlerMap;
    private prepareBrokerDatabase;
    getClient(): mqtt.MqttClient;
}
export {};
//# sourceMappingURL=api.d.ts.map