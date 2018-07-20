import { MQTTClient, MQTTTopic, TopicHandlers } from './mqtt.model';
/**
 * MQTTAPI handles all low level MQTT related tasks and scheduling.
 */
export declare class MQTTAPI {
    private clientCollection;
    private topicCollection;
    private handlers;
    private mqtt_client;
    private topicMap;
    private workers;
    /**
     * MQTTAPI
     * @param broker_url mqtt url, e.g. `mqtt://localhost`
     * @param clientCollection Meteor Mongo collection of type `Mongo.Collection<MQTTClient>`
     * @param topicCollection Meteor Mongo collection of type `Mongo.Collection<MQTTTopic>`
     * @param handlers object that implements `TopicHandlers` interface
     */
    constructor(broker_url: string, clientCollection: Mongo.Collection<MQTTClient>, topicCollection: Mongo.Collection<MQTTTopic>, handlers: TopicHandlers);
    /**
     * Add new MQTTClient to client collections for the broker to use for authentication.
     * @param clientID
     * @param credentials
     */
    private insertNewClient;
    private createHandlerMap;
    /**
     * Add or update the necessary documents for the MQTT Broker
     * @param options must contain password and username for server to login to broker.
     */
    private prepareBrokerDatabase;
    /**
     * Returns `MQTTWorker` for specific client, based on username
     * @param username unique client identifier
     */
    private getWorker;
    /**
     * Parse incomming topic name and dispatch message to correct handler
     * using client-specific worker.
     * @param topic name of mqtt topic in the form of `f/{username}/{topic}`
     * @param message payload bytes in a Nodejs Buffer
     */
    private topicDispatch;
    private hi_protocol_handler;
    private register_protocol_handler;
    private verify_protocol_handler;
}
//# sourceMappingURL=api.d.ts.map