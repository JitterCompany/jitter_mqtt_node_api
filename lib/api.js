"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mqtt = require("mqtt");
const crypto_js_1 = require("crypto-js");
const mqtt_protocol_1 = require("./mqtt-protocol");
const crypto = require("crypto");
function randomSecret(n) {
    return crypto.randomBytes(n).toString('hex');
}
const ANON_MQTT_USERNAME = 'anon';
const MAX_PACKET_SIZE = 1024; // bytes
const STANDARD_TOPICS = [
    'f/+/register',
    'f/+/verify',
    'f/+/hi',
    'f/+/bye'
];
const TEST_TOPICS = [
    'f/+/fixeddatatest/#',
    'f/+/acktest/#',
    'f/+/selftest'
];
const topicWhitelist = ['register', 'verify'];
class MQTTAPI {
    constructor(clientCollection, topicCollection, broker_url, handlers) {
        this.clientCollection = clientCollection;
        this.topicCollection = topicCollection;
        this.handlers = handlers;
        this.workers = {};
        this.hi_protocol_handler = (username, payload, worker) => {
            if (!payload.byteLength) {
                return;
            }
            const msg = payload.readUInt8(0);
            const wantsOffline = msg === 0;
            const shouldOffline = this.handlers.topic_hi(username, wantsOffline);
            const done = worker.allTransfersFinished() && shouldOffline;
            console.log('can offline: ', done);
            const r = new Buffer(1);
            r.writeUInt8(+done, 0);
            this.mqtt_client.publish(`t/${username}/hi`, r);
        };
        this.register_protocol_handler = (clientID) => {
            const prefix = 'client-';
            if (clientID.startsWith(prefix)) {
                const id = clientID.slice(prefix.length);
                const clients = this.clientCollection.find({ clientID: id }).fetch();
                if (clients.length) {
                    const client = clients[0];
                    if (client.verified) {
                        // already registerd..
                        console.error(`clientID [${clientID}] already exists and registed`);
                        this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify({ 'error': 'already registered' }));
                        return;
                    }
                    console.log('re-register for client:', clientID);
                    this.clientCollection.remove({ clientID: clientID });
                }
                console.log('register for client:', clientID);
                const login = newMQttLoginCredentials();
                this.insertNewClient(clientID, login);
                this.handlers.topic_register(login.username, clientID);
                this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify(login));
            }
            else {
                this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify({ 'error': 'invalid request' }));
                console.error(`Invalid clientID [${clientID}]: does not start with [${prefix}]`);
            }
        };
        this.verify_protocol_handler = (username) => {
            const client = this.clientCollection.findOne(username);
            if (client) {
                if (!client.verified) {
                    this.clientCollection.update(username, {
                        $set: {
                            verified: true
                        }
                    });
                }
                // Send confirmation when registered succesfully,
                // also when already registered, since previous confirmation
                // may have been lost.
                console.log('send confirm register on', `t/${username}/verify`);
                this.mqtt_client.publish(`t/${username}/verify`, '');
                this.handlers.topic_verify(username);
            }
            else {
                console.error(`username ${username} not associated with sensor`);
            }
        };
        this.createHandlerMap(handlers);
        const options = {
            username: randomSecret(10),
            password: randomSecret(30),
        };
        this.prepareBrokerDatabase(options);
        this.mqtt_client = mqtt.connect(broker_url, options);
        this.mqtt_client.on('connect', () => console.log('connected to broker'));
        this.mqtt_client.on('reconnect', () => console.log('reconnected to broker'));
        this.mqtt_client.on('close', () => console.log('disconnected from broker'));
        const topics = Object.keys(this.topicMap).map(t => 'f/+/' + t);
        this.mqtt_client.subscribe(topics, function (error, g) {
            console.log('registered on topics:');
            console.log(g.map(gg => gg.topic));
        });
        this.mqtt_client.on('message', (topic, message) => this.topicDispatch(topic, message));
    }
    getWorker(username) {
        if (!this.workers[username]) {
            this.workers[username] = new mqtt_protocol_1.MQTTWorker(username, this.mqtt_client, MAX_PACKET_SIZE);
        }
        return this.workers[username];
    }
    clientIsVerified(username) {
        return true;
        // const client = this.clientCollection.findOne(username);
        // return client && client.verified;
    }
    topicDispatch(topic, message) {
        const m = topic.match('f\/([^\/]*)\/(.*)');
        if (m) {
            const username = m[1];
            const topicname = m[2];
            const worker = this.getWorker(username);
            const handler = this.topicMap[topicname];
            if (worker && handler) {
                let allowed = !!topicname && !!topicWhitelist.find(t => t === topicname);
                if (!allowed) {
                    if (!worker.verified) {
                        worker.verified = this.clientIsVerified(username);
                    }
                    allowed = worker.verified;
                }
                if (allowed) {
                    worker.addTask(handler, message);
                }
                else {
                    console.error(`Not allowed to call handler for topic '${topicname}'. Username: '${username}'.`);
                }
            }
            else {
                console.error(`No worker or handler for topic '${topicname}'. Username: '${username}'.`);
            }
        }
        else {
            console.warn(`Unmatched topic: ${topic}`);
        }
    }
    createHandlerMap(handlers) {
        this.topicMap = {
            'register': this.register_protocol_handler,
            'verify': this.verify_protocol_handler,
            'hi': this.hi_protocol_handler,
            'bye': handlers.topic_bye,
            'fixeddatatest': (username, payload, worker) => worker.topic_fixeddatatest(payload),
            'fixeddatatest/ack': (username, payload, worker) => worker.topic_fixeddatatest_ack(payload),
            'acktest': (username, payload, worker) => worker.topic_acktest(payload),
            'acktest/ack': (username, payload, worker) => worker.topic_acktest_ack(payload),
            'selftest': (username, payload, worker) => worker.topic_selftest(payload)
        };
        handlers.topic_list.forEach(topic_desc => {
            const handler = handlers['topic_' + topic_desc.topicName];
            let wrapped_handler;
            if (!handler) {
                throw new Error(`no handler for topic [${topic_desc.topicName}]`);
            }
            if (topic_desc.type && topic_desc.type === 'fixeddata') {
                wrapped_handler = (username, payload, worker) => {
                    const topic = `f/${username}/${topic_desc.topicName}`;
                    const data = worker.fixedDataReceiveHandler(topic, payload);
                    if (data) {
                        handler(username, data);
                    }
                };
            }
            else {
                wrapped_handler = (username, payload, worker) => handler(username, payload);
            }
            this.topicMap[topic_desc.topicName] = wrapped_handler;
        });
    }
    prepareBrokerDatabase(options) {
        console.log('Adding server as mqtt client');
        const server = {
            _id: options.username,
            topics: 'server',
            password: password_encoding(options.password),
            clientID: 'server',
            verified: true,
        };
        this.clientCollection.upsert(options.username, server);
        console.log('Adding anon as mqtt client');
        const anon = {
            _id: ANON_MQTT_USERNAME,
            topics: 'anon',
            clientID: 'anon',
            verified: true,
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
    insertNewClient(clientID, credentials) {
        const newClient = {
            _id: credentials.username,
            password: password_encoding(credentials.password),
            topics: 'sensor',
            clientID: clientID,
            verified: false
        };
        this.clientCollection.insert(newClient);
    }
}
exports.MQTTAPI = MQTTAPI;
function password_encoding(password) {
    const salt = randomSecret(20);
    const iterations = 1;
    const word = crypto_js_1.PBKDF2(password, salt, { keySize: 512 / 32, hasher: crypto_js_1.algo.SHA256, iterations });
    const hash = crypto_js_1.enc.Base64.stringify(word);
    const pw_store = `PBKDF2$sha256$${iterations}$${salt}$${hash}`;
    return pw_store;
}
function newMQttLoginCredentials() {
    const password = randomSecret(16);
    const random = randomSecret(48);
    const username = randomSecret(4);
    return { username, password, random };
}
exports.newMQttLoginCredentials = newMQttLoginCredentials;
//# sourceMappingURL=api.js.map