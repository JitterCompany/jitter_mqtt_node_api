/// <reference types="node" />
import * as mqtt from 'mqtt';
import { MQTTTest, MQTTAckTest } from './mqtt-protocol-test';
import { TopicHandlerWorker } from './api';
declare class FixedDataReceiveState {
    total_packets: number;
    data: Buffer[];
    retries: number;
    /**
     * returns true if total package received is as expected
     */
    tranfser_complete(): boolean;
    packets_received(): number;
    reset_retries(): void;
    retry(): boolean;
    clear(): void;
}
declare class FixedDataSendState {
    data: Buffer[];
    packets_received: number;
    retries: number;
    constructor(data: Buffer[]);
    readonly total_packets: number;
    tranfser_finished(): boolean;
    retry(): boolean;
}
interface WorkerTask {
    handler: TopicHandlerWorker;
    payload: Buffer;
}
/**
 * MQTTWorker base class
 *
 * This class can be subclassed to create a specific
 * Jitter MQTT DataProtocol object
 */
export declare class MQTTWorker {
    protected username: string;
    protected mqtt_client: mqtt.MqttClient;
    protected max_packet_size: number;
    queue: WorkerTask[];
    workerRunning: boolean;
    topicReceiveState: Map<string, FixedDataReceiveState>;
    topicSendState: Map<string, FixedDataSendState>;
    protected test: MQTTTest | undefined;
    protected ackTest: MQTTAckTest | undefined;
    constructor(username: string, mqtt_client: mqtt.MqttClient, max_packet_size: number);
    /**
     * Returns whether current mqtt user has a verified account
     * in this system. This member function must be implemented by
     * the subclass.
     */
    protected isVerified(topicName?: string): boolean;
    allTransfersFinished(): boolean;
    protected getReceiveState(topic: string): FixedDataReceiveState;
    protected getSendState(topic: string): FixedDataSendState | undefined;
    protected createSendTransfer(topic: string, data: any): void;
    protected sendPackets(topic: string, packets: Buffer[]): boolean;
    /**
   * Topic for receiving testdata when (dummy) sensor is
   * testing server fixed data protocol implementation
   * @param payload
   */
    topic_fixeddatatest(payload: Buffer): void;
    /**
   * Topic for receiving tests from sensor when server is testing
   * sensor fixed data protocol implementation
   * @param payload
   */
    topic_fixeddatatest_ack(payload: Buffer): void;
    /**
     * Starts a test routine to test the protocol implementation for the
     * client that requests it.
     * @param payload
     */
    topic_selftest(payload: Buffer): void;
    topic_acktest_ack(payload: Buffer): void;
    topic_acktest(payload: Buffer): void;
    addTask(topicHandler: TopicHandlerWorker, payload_in: Buffer): void;
    fixedDataProgessHandler(topic: string, payload: Buffer): number;
    fixedDataAckHandler(topic: string, payload: Buffer): boolean;
    fixedDataReceiveHandler(topic: string, payload: Buffer): Buffer | undefined;
}
export {};
//# sourceMappingURL=mqtt-protocol.d.ts.map