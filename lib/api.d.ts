/// <reference types="node" />
import { MQTTClient, MQTTTopic } from './mqtt.model';
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
    topic_register: (username: string, clientID: string) => void;
    topic_verify: (username: string) => void;
    topic_list: TopicDescriptor[];
}
export declare class MQTTAPI {
    private clientCollection;
    private topicCollection;
    private handlers;
    private mqtt_client;
    private topicMap;
    private workers;
    constructor(clientCollection: Mongo.Collection<MQTTClient>, topicCollection: Mongo.Collection<MQTTTopic>, broker_url: string, handlers: TopicHandlers);
    private getWorker;
    private clientIsVerified;
    private topicDispatch;
    hi_protocol_handler: (username: string, payload: Buffer, worker: MQTTWorker) => void;
    register_protocol_handler: (clientID: string) => void;
    private verify_protocol_handler;
    private createHandlerMap;
    private prepareBrokerDatabase;
    insertNewClient(clientID: string, credentials: any): void;
}
export declare function newMQttLoginCredentials(): {
    username: string;
    password: string;
    random: string;
};
export {};
//# sourceMappingURL=api.d.ts.map