import * as mqtt from 'mqtt';
export declare class MQTTAPI {
    private clientCollection;
    private topicCollection;
    private mqtt_client;
    constructor(clientCollection: Mongo.Collection<{}>, topicCollection: Mongo.Collection<{}>, broker_url: string);
    private prepareBrokerDatabase;
    getClient(): mqtt.MqttClient;
}
//# sourceMappingURL=api.d.ts.map