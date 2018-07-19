import * as mqtt from 'mqtt';
import { PBKDF2, algo, enc } from 'crypto-js';
import { MQTTClient, MQTTTopic } from './mqtt.model';
import { MQTTWorker } from './mqtt-protocol';
import * as crypto from 'crypto';


function randomSecret(n: number) {
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
]

export interface TopicReturnDescriptor {
  topicname: string,
  message: Buffer
}

type TopicReturnMessage = string | Buffer | TopicReturnDescriptor[] | undefined | void;

export declare type TopicHandler = (username: string, payload?: Buffer) => TopicReturnMessage;
export declare type TopicHandlerWorker = (username: string, payload?: Buffer, worker?: MQTTWorker) => TopicReturnMessage;
type TopicType = "fixeddata" | "normal";

export interface TopicDescriptor {
  topicName: string;
  type?: TopicType;
}

export interface TopicMap {
  [topicName: string]: TopicHandlerWorker
}

export interface TopicHandlers {
  topic_hi: (username: string, wantsOffline: boolean) => boolean;
  topic_bye: TopicHandler;
  topic_register: (username: string, clientID: string) => void;
  topic_verify: TopicHandler;
  topic_list: TopicDescriptor[];
}

export class MQTTAPI {

  private mqtt_client: mqtt.MqttClient;
  private topicMap: TopicMap;
  private workers: {[username: string]: MQTTWorker} = {};

  constructor(
    private clientCollection: Mongo.Collection<MQTTClient>,
    private topicCollection: Mongo.Collection<MQTTTopic>,
    broker_url: string,
    private handlers: TopicHandlers
  ) {

    this.createHandlerMap(handlers);

    const options: mqtt.IClientOptions = {
      username: randomSecret(10),
      password: randomSecret(30),
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



  private getWorker(username: string) {
    if (!this.workers[username]) {
      this.workers[username] = new MQTTWorker(username, this.mqtt_client, MAX_PACKET_SIZE);
    }
    return this.workers[username];
  }

  private topicDispatch(topic: string, message: Buffer) {
    const m = topic.match('f\/([^\/]*)\/(.*)');
    if (m) {
      const username = m[1];
      const topicname = m[2];
      const worker = this.getWorker(username);
      if (worker) {
        const handler = this.topicMap[topicname];
        if (handler) {
          worker.addTask(handler, message);
        } else {
          console.error(`No handler for topic '${topicname}'. Username: '${username}'.`);
        }
      } else {
        console.error(`No worker for username ${username}`);
      }
    } else {
      console.warn(`Unmatched topic: ${topic}`);
    }
  }

  public hi_protocol_handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
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

  public register_protocol_handler = (clientID: string) => {
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
      const login = newMQttLoginCredentials();
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

      this.handlers.topic_verify(username);
    } else {
      console.error(`username ${username} not associated with sensor`);
    }
  }

  private createHandlerMap(handlers: TopicHandlers) {
    this.topicMap = {
      'register': this.register_protocol_handler,
      'verify': this.verify_protocol_handler,
      'hi': this.hi_protocol_handler,
      'bye': handlers.topic_bye,
      'fixeddatatest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_fixeddatatest(payload),
      'fixeddatatest/ack': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_fixeddatatest_ack(payload),
      'acktest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_acktest(payload),
      'acktest/ack': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_acktest_ack(payload),
      'selftest': (username: string, payload: Buffer, worker: MQTTWorker) => worker.topic_selftest(payload)
    };

    handlers.topic_list.forEach(topic_desc => {

      const handler: TopicHandler = handlers['topic_' +  topic_desc.topicName];
      let wrapped_handler;
      if (!handler) {
        throw new Error(`no handler for topic [${topic_desc.topicName}]`);
      }

      if (topic_desc.type && topic_desc.type === 'fixeddata') {
        wrapped_handler = (username: string, payload: Buffer, worker: MQTTWorker) => {
          const topic = `f/${username}/${topic_desc.topicName}`;
          const data = worker.fixedDataReceiveHandler(topic, payload);
          if (data) {
            handler(username, data);
          }
        }
      } else {
        wrapped_handler = (username: string, payload: Buffer, worker: MQTTWorker) => handler(username, payload);
      }

      this.topicMap[topic_desc.topicName] = wrapped_handler;
    });
  }

  private prepareBrokerDatabase(options: mqtt.IClientOptions) {

    console.log('Adding server as mqtt client');
    // TODO: can be random password everytime
    const server: MQTTClient = {
      _id: options.username,
      topics: 'server',
      password: password_encoding(options.password),
      clientID: 'server',
      verified: true,
    };
    this.clientCollection.upsert(options.username, server);

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

  insertNewClient(clientID: string, credentials) {
    const newClient: MQTTClient = {
      _id: credentials.username,
      password: password_encoding(credentials.password),
      topics: 'sensor',
      clientID: clientID,
      verified: false
    };
    this.clientCollection.insert(newClient);
  }
}

function password_encoding(password: string) {
  const salt = randomSecret(20);
  const iterations = 1;
  const word = PBKDF2(password, salt, { keySize: 512 / 32, hasher: algo.SHA256, iterations });
  const hash = enc.Base64.stringify(word);
  const pw_store = `PBKDF2$sha256$${iterations}$${salt}$${hash}`;
  return pw_store;
}

export function newMQttLoginCredentials() {
  const password = randomSecret(16);
  const random = randomSecret(48);
  const username = randomSecret(4);

  return { username, password, random };
}