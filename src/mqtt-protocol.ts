import * as mqtt from 'mqtt';
const Fiber = require('fibers');
import { runTests, MQTTTest, MQTTAckTest } from './mqtt-protocol-test';
import { checkCRC32, createFixedDataPacket, getAckTopicName } from './mqtt.utils';
import { TopicHandlerWorker } from './api';

const MAX_TRANSFER_RETRIES = 5;


class FixedDataReceiveState {
  total_packets = 0;
  data: Buffer[] = [];
  retries = MAX_TRANSFER_RETRIES;

  /**
   * returns true if total package received is as expected
   */
  tranfser_complete() {
    return this.packets_received() === this.total_packets;
  }

  packets_received() {
    return this.data.length;
  }

  reset_retries() {
    this.retries = MAX_TRANSFER_RETRIES;
  }

  retry() {
    this.retries -= 1;
    const limit = this.retries <= 0;
    if (limit) {
      this.retries = MAX_TRANSFER_RETRIES;
      return false;
    }
    return true;
  }

  clear() {
    this.total_packets = 0;
    this.data = [];
  }
}

class FixedDataSendState {
  packets_received = 0; // by receiver
  retries = MAX_TRANSFER_RETRIES;

  constructor(public data: Buffer[]) {}

  get total_packets() {
    return this.data.length;
  }

  tranfser_finished() {
    return this.packets_received === this.total_packets;
  }

  retry() {
    this.retries -= 1;
    const limit = this.retries <= 0;
    if (limit) {
      this.retries = MAX_TRANSFER_RETRIES;
      return false;
    }
    this.packets_received = 0;
    return true;
  }

}
interface WorkerTask {
  handler: TopicHandlerWorker
  payload: Buffer;
}

/**
 * MQTTWorker class
 *
 * This class implements queueing and executing topic handlers within a Fiber, as well as handling of
 * the FixedData protocol.
 */
export class MQTTWorker {

  private queue: WorkerTask[] = [];
  private workerRunning = false;
  private topicReceiveState: Map<string, FixedDataReceiveState> = new Map();
  private topicSendState: Map<string, FixedDataSendState> = new Map();
  protected test: MQTTTest | undefined;
  protected ackTest: MQTTAckTest | undefined;

  constructor(
    protected username: string,
    protected mqtt_client: mqtt.MqttClient,
    protected max_packet_size: number
  ) {}

  public allTransfersFinished() {
    let done = true;
    this.topicSendState.forEach((val, key) => {
      if (!val.tranfser_finished()) {
        done = false;
      }
    });
    return done && !this.test;
  }

  protected getReceiveState(topic: string): FixedDataReceiveState {
    if (!this.topicReceiveState.get(topic)) {
      this.topicReceiveState.set(topic, new FixedDataReceiveState());
    }
    return <FixedDataReceiveState>this.topicReceiveState.get(topic);
  }

  protected getSendState(topic: string): FixedDataSendState | undefined {
    return this.topicSendState.get(topic);
  }

  protected createSendTransfer(topic: string, data: any) {
    const packets = createFixedDataPacket(new Buffer(data), this.max_packet_size);
    this.sendPackets(topic, packets);
  }

  protected sendPackets(topic: string, packets: Buffer[]) {
    let state = this.topicSendState.get(topic);
    if (state) {
      console.warn(`Previous transfer not finished on topic ${topic}`);
      return false;
    }

    if (!state) {
      state = new FixedDataSendState(packets);
      this.topicSendState.set(topic, state);
    }

    state.data.forEach(
      packet => this.mqtt_client.publish(topic, packet));
    return true;
  }

  /**
   * Topic for receiving testdata when (dummy) sensor is
   * testing server fixed data protocol implementation
   * @param payload
   */
  public topic_fixeddatatest(payload: Buffer) {

    const topic = `f/${this.username}/fixeddatatest`;
    const data = this.fixedDataReceiveHandler(topic, payload);
    if (data) {
      console.log('received data of length: ', data.byteLength);
    }
  }

  /**
   * Topic for receiving tests from sensor when server is testing
   * sensor fixed data protocol implementation
   * @param payload
   */
  public topic_fixeddatatest_ack(payload: Buffer) {
    const topic = `t/${this.username}/fixeddatatest`;
    const done = this.fixedDataAckHandler(topic, payload);
    if (done) {
      console.log('file transfer done');
    }
  }

  /**
   * Starts a test routine to test the protocol implementation for the
   * client that requests it.
   * @param payload
   */
  public topic_selftest(payload: Buffer) {
    this.test = undefined;
    const topic = `t/${this.username}/fixeddatatest`;
    if (!this.getSendState(topic)) {
      console.log('Starting tests on topic', topic);
      this.test = runTests((packets: Buffer[]) => packets.forEach(
        packet => this.mqtt_client.publish(topic, packet)));
    } else {
      console.error('Cannot start test when transfer in progress');
    }
  }

  public topic_acktest_ack(payload: Buffer) {
    const topic = `t/${this.username}/acktest`;
    this.fixedDataAckHandler(topic, payload);
  }

  public topic_acktest(payload: Buffer) {
    if (!this.ackTest) {
      this.ackTest = new MQTTAckTest();
    }
    const ack = this.ackTest.newPacket(payload);
    if (ack) {
      const topic = `f/${this.username}/acktest`;
      this.mqtt_client.publish(getAckTopicName(topic), ack);

      if (ack.readUInt16LE(0) === 0xFFFF) {
        // start test in the other direction by sending a transfer of 7 packets
        const sendtopic = `t/${this.username}/acktest`;
        if (this.getSendState(sendtopic)) {
          console.warn('clearing sendstate for new acktest');
          this.topicSendState.delete(sendtopic);
        }
        const test_str = 'TestData';
        const data = createFixedDataPacket(new Buffer(test_str.repeat(6)), 8);
        console.log('send acktest data to ', sendtopic);
        this.sendPackets(sendtopic, data);
      }
    }
  }

  public addTask(topicHandler: TopicHandlerWorker, payload_in: Buffer) {
    this.queue.push({handler: topicHandler, payload: payload_in});

    if (this.workerRunning) {
      return;
    }
    this.workerRunning = true;

    const processNext = () => {
      const item = this.queue && this.queue.shift();
      if (!item) {
        this.workerRunning = false;
        return;
      }

      Fiber(() => {
        let blocked = true;

        const unblock = () => {
          if (!blocked) {
            return; // idempotent
          }
          blocked = false;
          processNext();
        };

        item.handler(this.username, item.payload, this);

        unblock(); // in case the handler didn't already do it
      }).run();
    };

    processNext();

  }

  public fixedDataProgessHandler(topic: string, payload: Buffer) {

    const state = this.getSendState(topic);
    if (payload.byteLength) {
      const p = payload.readUInt16LE(0);
      if (state) {
        state.packets_received = p;
        return p / state.total_packets * 100;
      }
    }
    return 0;
  }

  public fixedDataAckHandler(topic: string, payload: Buffer) {
    const ack = payload.readUInt16LE(0);

    const state =  this.topicSendState.get(topic);
    if (this.test && (topic === `t/${this.username}/fixeddatatest`)) {
      const testFinished = this.test.got_ack(ack);
      if (testFinished) {
        console.log('test is finished');
        this.test = undefined;
      }
      return false;
    }

    let done = false;
    if (state) {
      if (ack === state.total_packets) {
        this.topicSendState.delete(topic);
        done = true;
      } else if (ack > state.total_packets) {
        if (ack === 0xFFFF) {
          // got force ack, stop retrying this transfer: failure
          console.error('Got Force ACK, transfer failed');
        } else {
          console.error(`Got illegal ack. ack (${ack}) > transfer size ${state.total_packets}`);
        }
        this.topicSendState.delete(topic);
        done = true;
      } else {
        // retry from acked packet
        if (state.retry()) {
          state.data.slice(ack).forEach(
            packet => this.mqtt_client.publish(topic, packet));
        } else {
          console.error('Send transfer failed: too many retries');
        }

      }
    } else {
      console.error(`cannot find send state for topic ${topic}`);
    }

    return done;
  }

  public fixedDataReceiveHandler(topic: string, payload: Buffer): Buffer | undefined {
    const state = this.getReceiveState(topic);

    const packet_number = payload.readUInt16LE(0);
    const rmsg = new Buffer(2);

    let valid = true;

    // Check if packet number is expected
    if (!(packet_number === state.packets_received())) {
      console.error(`unexpected packet number, got ${packet_number}, expected ${state.packets_received()}`);
      valid = false;

      if (packet_number === 0) {
        console.log('got packet no. 0: reset state for new transfer');
        state.clear();
        if (!state.retry()) {
          // send 0xFFFF to Force Ack, failed too many times in a row
          rmsg.writeUInt16LE(0xFFFF, 0);
          console.error('MAX RETRIES reached: sending force ack');
        }
        valid = true;
      }
    }

    // if packet number is first packet in transfer: set total_packets
    if (packet_number === 0) {
      state.total_packets = payload.readUInt16LE(2);
    } else if (state.total_packets && (state.total_packets !== payload.readUInt16LE(2))) {
      // total package changed unexpectedly
      console.error('total package changed unexpectedly: sending 0 ack, reset state');
      valid = false;
      state.clear();
      if (state.retry()) {
        // send Ack to restart transfer from last correct package received
        rmsg.writeUInt16LE(0, 0);
      } else {
        // send 0xFFFF to Force Ack, failed too many times in a row
        rmsg.writeUInt16LE(0xFFFF, 0);
        console.error('MAX RETRIES reached: sending force ack');
      }
      this.mqtt_client.publish(getAckTopicName(topic), rmsg);
      return;
    }
    if (valid) {
      // add payload after header to data store
      state.data.push(payload.slice(4));
      // console.log('packet:', packet_number);
    }

    if (packet_number === (state.total_packets - 1)) {
      let complete = false;
      let all_data: Buffer | undefined;
      // concatenate data and do something...
      if (state.tranfser_complete()) {
        all_data = Buffer.concat(state.data);
        if (checkCRC32(all_data)) {
          const data = all_data.slice(0, -4);
          console.log('transfer complete');
          complete = true;
          state.reset_retries();
          rmsg.writeUInt16LE(state.packets_received(), 0);
        } else {
          console.error('transfer failed: checksum error');
          if (state.retry()) {
            // send 0 as Ack to restart transfer, because crc32 failed
            rmsg.writeUInt16LE(0, 0);
            console.log('sending 0 ack');
          } else {
            // send 0xFFFF to Force Ack, failed too many times in a row
            console.error('MAX RETRIES reached: sending force ack');
            rmsg.writeUInt16LE(0xFFFF, 0);
          }
        }
        state.clear();
      } else {
        console.warn(`transfer incomplete, nack at ${state.packets_received()}`);
        if (state.retry()) {
          // send Ack to restart transfer from last correct package received
          rmsg.writeUInt16LE(state.packets_received(), 0);
        } else {
          // send 0xFFFF to Force Ack, failed too many times in a row
          console.error('MAX RETRIES reached: sending force ack');
          rmsg.writeUInt16LE(0xFFFF, 0);
        }
      }
      // console.log('sending ack on:', getAckTopicName(topic));
      this.mqtt_client.publish(getAckTopicName(topic), rmsg);
      return complete ? all_data : undefined;
    }
    return;
  }
}
