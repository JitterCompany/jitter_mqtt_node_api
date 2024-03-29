/// <reference types="node" />
import { ProgressEventCallback } from "./mqtt-metadata";
/**
 * The MQTTClient interface describes the schema for the required Mongo collection for the
 * MQTT Clients. The API will use this collection to add new login credentials so that the broker
 * can use it for login authentication.
 */
export interface MQTTClient {
    _id: string;
    topics: string;
    password?: string;
    clientID: string;
    verified: boolean;
}
/**
 * TopicMap maps a topicname to permissions:
 * `Map<topicname, permissions>`
 *
 * Permissions can be: `w`, `r`, `rw`
 */
export declare type TopicMap = Map<string, string>;
/**
 * The MQTTTopic interface is needed for the Topic (Mongo) Collection.  This collection contains the permissions for each role.
 * Roles are assigned to MQTTClients. The broker uses this collection to determine if publishing or subscribing is allowed for each pair of
 * client and topic.
 */
export interface MQTTTopic {
    _id?: string;
    topics: TopicMap;
}
export declare type TopicHandler = (username: string, topic: string, payload?: Buffer) => TopicReturnMessage;
/**
 * TopicHandlers interface needs to be implemented by an object that is passed to
 * the MQTTAPI. The interface contains the topic handlers for the topics that form the
 * protocol.
 *
 * Additionally, this object can implement custom handlers for arbitrary topics. These additional
 * topics should be described by a `TopicDescriptor` in the topic_list. This makes sure that the mqtt driver
 * will subscribe to that topic and that the correct handler is called for each message.
 *
 * The handlers use a standard naming scheme. If your topic is called `myCustomTopic`, then the driver will
 * look for a handler of the name: `topic_myCustomTopic(username: string, payload?: Buffer) => TopicReturnMessage`.
 */
export interface TopicHandlers {
    topic_hi: (username: string, wantsOffline: boolean) => boolean;
    topic_bye: TopicHandler;
    topic_register: (username: string, clientID: string) => void;
    topic_verify: (username: string, clientID: string) => void;
    topic_list: TopicDescriptor[];
    progressUpdate?: ProgressEventCallback;
}
/**
 * TopicType for specifying the used protocol on each topic.
 * See `TopicDescriptor` for more information.
 */
export declare type TopicType = "fixeddata" | "normal";
/**
 * TopicDescriptor tells the API in what way incomming messages should be processed.
 * When the type is `normal` or when no type is specified any message will be directly passed to the
 * handler in `TopicHandlers`.
 * When the type is `fixeddata`, the API will handle all incomming messages according to the FixedData Transfer protocol
 * and will only call the specified handler when a transfer has been completed.
 */
export interface TopicDescriptor {
    topicName: string;
    type?: TopicType;
}
export interface TopicReturnDescriptor {
    topicname: string;
    message: string | Buffer;
    type?: TopicType;
}
export declare type TopicReturnMessage = TopicReturnDescriptor | TopicReturnDescriptor[] | void;
export interface LoginCredentials {
    username: string;
    password: string;
    random: string;
}
//# sourceMappingURL=mqtt.model.d.ts.map