import * as mqtt from 'mqtt';

import { MQTTClient, MQTTTopic, TopicHandlers, TopicHandler } from './mqtt.model';
import { MQTTWorker, TopicHandlerWorker } from './mqtt-protocol';
import { utils } from './utils';
import { MQTTMetaData } from './mqtt-metadata';

const ANON_MQTT_USERNAME = 'anon';
const MAX_PACKET_SIZE = 1024; // bytes

/**
 * MQTTAPI handles all low level MQTT related tasks and scheduling.
 */
export class MQTTAPI {

  private mqtt_client: mqtt.MqttClient;
  private topicMap: {[topicName: string]: TopicHandlerWorker};
  private workers: {[username: string]: MQTTWorker} = {};
  private metadata = new MQTTMetaData();
  /**
   * MQTTAPI
   * @param broker_url mqtt url, e.g. `mqtt://localhost`
   * @param clientCollection Meteor Mongo collection of type `Mongo.Collection<MQTTClient>`
   * @param topicCollection Meteor Mongo collection of type `Mongo.Collection<MQTTTopic>`
   * @param handlers object that implements `TopicHandlers` interface
   */
  constructor(
    broker_url: string,
    private clientCollection: Mongo.Collection<MQTTClient>,
    private topicCollection: Mongo.Collection<MQTTTopic>,
    private handlers: TopicHandlers
  ) {

    this.topicMap = this.createHandlerMap(handlers);

    const options: mqtt.IClientOptions = {
      username: 'server',
      password: utils.randomSecret(30),
    };

    this.prepareBrokerDatabase(options);

    this.mqtt_client = mqtt.connect(broker_url, options);
    this.mqtt_client.on('connect', () => console.log('connected to broker'));
    this.mqtt_client.on('reconnect', () => console.log('reconnected to broker'));
    this.mqtt_client.on('close', () => console.log('disconnected from broker'));

    const topics = Object.keys(this.topicMap).map(t => 'f/+/' + t);

    this.mqtt_client.subscribe(topics,
      function (error, g: mqtt.ISubscriptionGrant[]) {
        console.log('registered on topics:');
        console.log(g.map(gg => gg.topic));
      });
      this.mqtt_client.on('message', (topic, message) => this.topicDispatch(topic, message));
  }

  /**
   * Add new MQTTClient to client collections for the broker to use for authentication.
   * @param clientID
   * @param credentials
   */
  private insertNewClient(clientID: string, credentials: utils.LoginCredentials) {
    const newClient: MQTTClient = {
      _id: credentials.username,
      password: utils.password_encoding(credentials.password),
      topics: 'sensor',
      clientID: clientID,
      verified: false
    };
    this.clientCollection.insert(newClient);
  }

  private createHandlerMap(handlers: TopicHandlers) {

    // Standard protocol topics and handlers
    const topicMap = {
      'register': this.register_protocol_handler,
      'verify': this.verify_protocol_handler,
      'hi': this.hi_protocol_handler,
      'bye': handlers.topic_bye,
      'fixeddatatest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_fixeddatatest(payload),
      'acktest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_acktest(payload),
      'acktest/ack': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_acktest_ack(payload),
      'selftest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_selftest(payload),
      '+/ack':  (username: string, payload: Buffer, worker: MQTTWorker) => undefined, // special case: handled in topicDispatch
      '+/prog':  (username: string, payload: Buffer, worker: MQTTWorker) => undefined // special case: handled in topicDispatch: TODO
    };

    // Additionaly arbitrary user defined topics and handlers.
    handlers.topic_list.forEach(topic_desc => {

      const handler: TopicHandler = handlers['topic_' +  topic_desc.topicName.replace('/', '_')];
      let wrapped_handler;
      if (!handler) {
        throw new Error(`no handler for topic [${topic_desc.topicName}].
        Expected: 'topic_ +  ${topic_desc.topicName}(username: string, payload?: Buffer)'`);
      }

      if (topic_desc.type && topic_desc.type === 'fixeddata') {
        wrapped_handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
          const topic = `f/${username}/${topic_desc.topicName}`;
          const data = worker.fixedDataReceiveHandler(topic, payload);
          if (data) {
            return handler(username, data);
          }
        }
      } else {
        wrapped_handler = (username: string, payload: Buffer, worker: MQTTWorker) => handler(username, payload);
      }

      topicMap[topic_desc.topicName] = wrapped_handler;
    });
    return topicMap;
  }

  /**
   * Add or update the necessary documents for the MQTT Broker
   * @param options must contain password and username for server to login to broker.
   */
  private prepareBrokerDatabase(options: mqtt.IClientOptions) {

    console.log('Adding server as mqtt client');
    const server: MQTTClient = {
      _id: <string>options.username,
      topics: 'server',
      password: utils.password_encoding(<string>options.password),
      clientID: 'server',
      verified: true,
    };
    this.clientCollection.upsert(<string>options.username, server);

    console.log('Adding anon as mqtt client');
    const anon: MQTTClient = {
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
  private getWorker(username: string) {
    if (!this.workers[username]) {
      this.workers[username] = new MQTTWorker(username, this.mqtt_client, MAX_PACKET_SIZE, this.metadata);
    }
    return this.workers[username];
  }

  /**
   * Parse incomming topic name and dispatch message to correct handler
   * using client-specific worker.
   * @param topic name of mqtt topic in the form of `f/{username}/{topic}`
   * @param message payload bytes in a Nodejs Buffer
   */
  private topicDispatch(topic: string, message: Buffer) {
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
      // if (!ackM) {
      //   console.warn(`Unmatched topic: ${topic}`);
      //   return;
      // }
      if (ackM) {
        const topicname = ackM[2];
        handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
          const ltopic = `t/${username}/${topicname}`;
          const done = worker.fixedDataAckHandler(ltopic, payload);
          if (done) {
            this.metadata.finishProgress(username, ltopic);
            if (this.handlers.progressUpdate) {
              this.handlers.progressUpdate(this.metadata.getProgressData(username));
            }
            console.log('file transfer done');
          }
        }
      }
    }

    // check if we need the progress handler
    if (!handler) {
      const progM = topic.match('f\/([^\/]*)\/(.*)/prog')
      if (progM) {
        const topicname = progM[2];
        handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
          const progress = payload.readUInt16LE(0);
          const ltopic = `t/${username}/${topicname}`;
          this.metadata.updateProgress(username, ltopic, progress);
          if (this.handlers.progressUpdate) {
            this.handlers.progressUpdate(this.metadata.getProgressData(username));
          }
        };
        // console.log('received progress data for ', topicname, ' data:', message);
      }
    }

    if(handler) {
      worker.addTask(handler, message);
    } else {
      console.error(`No handler for topic '${topicname}'. Username: '${username}'.`);
    }
  }

  // Built-in protocol topic handlers

  private hi_protocol_handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
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
  }

  private register_protocol_handler = (clientID: string) => {
    const prefix = 'client-';
    if (clientID.startsWith(prefix)) {
      const id = clientID.slice(prefix.length);
      const clients = this.clientCollection.find({clientID: id}).fetch();
      if (clients.length) {
        const client = clients[0];
        if (client.verified) {
          // already registerd..
          console.error(`clientID [${clientID}] already exists and registed`);
          this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify({ 'error': 'already registered' }));
          return;
        }
        console.log('re-register for client:', clientID);
        this.clientCollection.remove({clientID: clientID});
      }
      console.log('register for client:', clientID);
      const login = utils.newMQttLoginCredentials();
      this.insertNewClient(clientID, login);
      this.handlers.topic_register(login.username, clientID);
      this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify(login));
    } else {
      this.mqtt_client.publish(`t/${clientID}/register`, JSON.stringify({ 'error': 'invalid request' }));
      console.error(`Invalid clientID [${clientID}]: does not start with [${prefix}]`);
    }
  }

  private verify_protocol_handler = (username: string) => {
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
    } else {
      console.error(`username ${username} not associated with sensor`);
    }
  }

}
