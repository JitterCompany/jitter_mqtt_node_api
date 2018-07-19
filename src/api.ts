import * as mqtt from 'mqtt';
import { PBKDF2, algo, enc } from 'crypto-js';
import { MQTTClient } from './mqtt.model';
import { MQTTWorker } from './mqtt-protocol';


const SERVER_MQTT_PASSWORD = 'YjqoqvjGZ8ktu*sKc&LZ@2tr9s3UYf';
const SERVER_MQTT_USERNAME = 'server';
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
  topic_register: TopicHandler;
  topic_verify: TopicHandler;
  topic_list: TopicDescriptor[];
}

export class MQTTAPI {

  private mqtt_client: mqtt.MqttClient;
  private topicMap: TopicMap;
  private workers: {[username: string]: MQTTWorker} = {};

  constructor(
    private clientCollection: Mongo.Collection<{}>,
    private topicCollection: Mongo.Collection<{}>,
    broker_url: string,
    private handlers: TopicHandlers
  ) {

    this.createHandlerMap(handlers);
    this.prepareBrokerDatabase();

    const options: mqtt.IClientOptions = {
      username: SERVER_MQTT_USERNAME,
      password: SERVER_MQTT_PASSWORD,
    };


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

  private createHandlerMap(handlers: TopicHandlers) {
    this.topicMap = {
      'register': handlers.topic_register,
      'verify': handlers.topic_verify,
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

  private prepareBrokerDatabase() {

    console.log('Adding server as mqtt client');
    // TODO: can be random password everytime
    const server: MQTTClient = {
      _id: SERVER_MQTT_USERNAME,
      topics: 'server',
      password: password_encoding(SERVER_MQTT_PASSWORD)
    };
    this.clientCollection.upsert(SERVER_MQTT_USERNAME, server);

    console.log('Adding anon as mqtt client');
    const anon: MQTTClient = {
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

function password_encoding(password: string) {
  const salt = 'abcdefghijkalsdfkj'; // TODO: replace with e.g.: Random.secret(20);
  const iterations = 1;
  const word = PBKDF2(password, salt, { keySize: 512 / 32, hasher: algo.SHA256, iterations });
  const hash = enc.Base64.stringify(word);
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