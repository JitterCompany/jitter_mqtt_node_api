"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = require("mqtt");
const crypto_js_1 = require("crypto-js");
// import { Mongo } from 'meteor/mongo';
// import { Random } from 'meteor/random';
const SERVER_MQTT_PASSWORD = 'YjqoqvjGZ8ktu*sKc&LZ@2tr9s3UYf';
const SERVER_MQTT_USERNAME = 'server';
const ANON_MQTT_USERNAME = 'anon';
class MQTTAPI {
    constructor(clientCollection, topicCollection, broker_url) {
        this.clientCollection = clientCollection;
        this.topicCollection = topicCollection;
        this.prepareBrokerDatabase();
        const options = {
            username: SERVER_MQTT_USERNAME,
            password: SERVER_MQTT_PASSWORD,
        };
        this.mqtt_client = mqtt.connect(broker_url, options);
        this.mqtt_client.on('connect', () => console.log('connected to broker'));
        this.mqtt_client.on('reconnect', () => console.log('reconnected to broker'));
        this.mqtt_client.on('close', () => console.log('disconnected from broker'));
    }
    prepareBrokerDatabase() {
        console.log('Adding server as mqtt client');
        // TODO: can be random password everytime
        const server = {
            _id: SERVER_MQTT_USERNAME,
            topics: 'server',
            password: password_encoding(SERVER_MQTT_PASSWORD)
        };
        this.clientCollection.upsert(SERVER_MQTT_USERNAME, server);
        console.log('Adding anon as mqtt client');
        const anon = {
            _id: ANON_MQTT_USERNAME,
            topics: 'anon',
        };
        this.clientCollection.upsert(ANON_MQTT_USERNAME, anon);
        this.topicCollection.upsert('server', {
            _id: 'server',
            topics: new Map([['t/#', 'w'], ['f/#', 'r']])
        });
        this.topicCollection.upsert('anon', {
            _id: 'anon',
            topics: new Map([['f/client-%c/register', 'w'], ['t/client-%c/register', 'r']])
        });
        this.topicCollection.upsert('sensor', {
            _id: 'sensor',
            topics: new Map([['f/%u/#', 'w'], ['t/%u/#', 'r']])
        });
    }
    getClient() {
        return this.mqtt_client;
    }
}
exports.MQTTAPI = MQTTAPI;
function password_encoding(password) {
    const salt = 'abcdefghijkalsdfkj'; // TODO: replace with e.g.: Random.secret(20);
    const iterations = 1;
    const word = crypto_js_1.PBKDF2(password, salt, { keySize: 512 / 32, hasher: crypto_js_1.algo.SHA256, iterations });
    const hash = crypto_js_1.enc.Base64.stringify(word);
    const pw_store = `PBKDF2$sha256$${iterations}$${salt}$${hash}`;
    return pw_store;
}
// export function newMQttLoginCredentials() {
//   const password = Random.secret(16);
//   const random = Random.secret(48);
//   const username = Random.secret(4);
//   const newClient: MQTTClient = {
//     _id: username,
//     password: password_encoding(password),
//     topics: 'sensor'
//   };
//   MQTTClientsCollection.collection.insert(newClient);
//   return { username, password, random };
// }
//# sourceMappingURL=api.js.map