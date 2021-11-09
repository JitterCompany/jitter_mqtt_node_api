"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MQTTAPI = void 0;
const mqtt = require("mqtt");
const mqtt_protocol_1 = require("./mqtt-protocol");
const utils_1 = require("./utils");
const mqtt_metadata_1 = require("./mqtt-metadata");
const ANON_MQTT_USERNAME = 'anon';
const DEFAULT_MAX_PACKET_SIZE = 1024; // bytes
/**
 * MQTTAPI handles all low level MQTT related tasks and scheduling.
 */
class MQTTAPI {
    /**
     * MQTTAPI
     * @param broker_url mqtt url, e.g. `mqtt://localhost`
     * @param clientCollection Meteor Mongo collection of type `Mongo.Collection<MQTTClient>`
     * @param topicCollection Meteor Mongo collection of type `Mongo.Collection<MQTTTopic>`
     * @param handlers object that implements `TopicHandlers` interface
     * @param maxPacketSize? optional packet size in bytes. Fixeddata transfers will be split in
     * packets of (max) this size
     */
    constructor(broker_url, clientCollection, topicCollection, handlers, maxPacketSize) {
        this.clientCollection = clientCollection;
        this.topicCollection = topicCollection;
        this.handlers = handlers;
        this.workers = {};
        this.maxPacketSize = DEFAULT_MAX_PACKET_SIZE;
        // Built-in protocol topic handlers
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
                const login = utils_1.utils.newMQttLoginCredentials();
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
                this.handlers.topic_verify(username, client.clientID);
            }
            else {
                console.error(`username ${username} not associated with sensor`);
            }
        };
        // Override default max packet size if provided
        if (maxPacketSize) {
            this.maxPacketSize = maxPacketSize;
        }
        this.metadata = new mqtt_metadata_1.MQTTMetaData(handlers.progressUpdate);
        this.topicMap = this.createHandlerMap(handlers);
        const options = {
            username: 'server',
            password: utils_1.utils.randomSecret(30),
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
    publish(username, topic, payload) {
        this.mqtt_client.publish(`t/${username}/${topic}`, payload);
    }
    /**
     * Get Progress Data for all FixedData topics for a specific `username`
     * @param username mqtt username of client
     */
    getProgressData(username) {
        return this.metadata.getProgressData(username);
    }
    /**
     * Add new MQTTClient to client collections for the broker to use for authentication.
     * @param clientID
     * @param credentials
     */
    insertNewClient(clientID, credentials) {
        const newClient = {
            _id: credentials.username,
            password: utils_1.utils.password_encoding(credentials.password),
            topics: 'sensor',
            clientID: clientID,
            verified: false
        };
        this.clientCollection.insert(newClient);
    }
    /**
     * Remove MQTTClient from client collections
     * @param username - mqtt username
     *
     * @returns number of clients removed (1 or 0)
     */
    deleteMQTTClient(username) {
        return this.clientCollection.remove({ _id: username });
    }
    createHandlerMap(handlers) {
        // Standard protocol topics and handlers
        const topicMap = {
            'register': this.register_protocol_handler,
            'verify': this.verify_protocol_handler,
            'hi': this.hi_protocol_handler,
            'bye': handlers.topic_bye,
            'fixeddatatest': (username, payload, worker) => worker.topic_fixeddatatest(payload),
            'acktest': (username, payload, worker) => worker.topic_acktest(payload),
            'acktest/ack': (username, payload, worker) => worker.topic_acktest_ack(payload),
            'selftest': (username, payload, worker) => worker.topic_selftest(payload),
            '+/ack': (username, payload, worker) => undefined,
            '+/prog': (username, payload, worker) => undefined // special case: handled in topicDispatch
        };
        // Additionaly arbitrary user defined topics and handlers.
        handlers.topic_list.forEach(topic_desc => {
            const handler = handlers['topic_' + topic_desc.topicName.replace('/', '_')];
            let wrapped_handler;
            if (!handler) {
                throw new Error(`no handler for topic [${topic_desc.topicName}].
        Expected: 'topic_ +  ${topic_desc.topicName}(username: string, payload?: Buffer)'`);
            }
            if (topic_desc.type && topic_desc.type === 'fixeddata') {
                wrapped_handler = (username, payload, worker) => {
                    const topic = `f/${username}/${topic_desc.topicName}`;
                    const data = worker.fixedDataReceiveHandler(topic, payload);
                    if (data) {
                        return handler(username, data);
                    }
                };
            }
            else {
                wrapped_handler = (username, payload, worker) => handler(username, payload);
            }
            topicMap[topic_desc.topicName] = wrapped_handler;
        });
        return topicMap;
    }
    /**
     * Add or update the necessary documents for the MQTT Broker
     * @param options must contain password and username for server to login to broker.
     */
    prepareBrokerDatabase(options) {
        console.log('Adding server as mqtt client');
        const server = {
            _id: options.username,
            topics: 'server',
            password: utils_1.utils.password_encoding(options.password),
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
    /**
     * Returns `MQTTWorker` for specific client, based on username
     * @param username unique client identifier
     */
    getWorker(username) {
        if (!this.workers[username]) {
            this.workers[username] = new mqtt_protocol_1.MQTTWorker(username, this.mqtt_client, this.maxPacketSize, this.metadata);
        }
        return this.workers[username];
    }
    /**
     * Parse incomming topic name and dispatch message to correct handler
     * using client-specific worker.
     * @param topic name of mqtt topic in the form of `f/{username}/{topic}`
     * @param message payload bytes in a Nodejs Buffer
     */
    topicDispatch(topic, message) {
        const m = topic.match('f\/([^\/]*)\/(.*)');
        if (!m) {
            console.warn(`Unmatched topic: ${topic}`);
            return;
        }
        const username = m[1];
        const topicname = m[2];
        const worker = this.getWorker(username);
        if (!worker) {
            console.error(`No worker for topic '${topicname}'. Username: '${username}'.`);
            return;
        }
        let handler = this.topicMap[topicname];
        // check if we need to use ack handler
        if (!handler) {
            const ackM = topic.match('f\/([^\/]*)\/(.*)/ack');
            if (ackM) {
                const topicname = ackM[2];
                handler = (username, payload, worker) => {
                    const ltopic = `t/${username}/${topicname}`;
                    const done = worker.fixedDataAckHandler(ltopic, payload);
                    if (done) {
                        this.metadata.finishProgress(username, ltopic);
                        console.log('file transfer done');
                    }
                };
            }
        }
        // check if we need the progress handler
        if (!handler) {
            const progM = topic.match('f\/([^\/]*)\/(.*)/prog');
            if (progM) {
                const topicname = progM[2];
                handler = (username, payload, worker) => {
                    const progress = payload.readUInt16LE(0);
                    const ltopic = `t/${username}/${topicname}`;
                    this.metadata.updateProgress(username, ltopic, progress);
                };
                // console.log('received progress data for ', topicname, ' data:', message);
            }
        }
        if (handler) {
            worker.addTask(handler, message);
        }
        else {
            console.error(`No handler for topic '${topicname}'. Username: '${username}'.`);
        }
    }
}
exports.MQTTAPI = MQTTAPI;
//# sourceMappingURL=api.js.map