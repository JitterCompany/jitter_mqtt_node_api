/// <reference types="node" />
import * as mqtt from 'mqtt';
import { MQTTTest, MQTTAckTest } from './mqtt-protocol-test';
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
    topic: string;
    payload: Buffer;
}
/**
 * MQTTWorker base class
 *
 * This class can be subclassed to create a specific
 * Jitter MQTT DataProtocol object
 */
export declare abstract class MQTTWorker {
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
    protected abstract isVerified(topicName?: string): boolean;
    protected allTransfersFinished(): boolean;
    protected getReceiveState(topic: string): FixedDataReceiveState;
    protected getSendState(topic: string): FixedDataSendState | undefined;
    protected createSendTransfer(topic: string, data: any): void;
    protected sendPackets(topic: string, packets: Buffer[]): boolean;
    /**
     * Starts a test routine to test the protocol implementation for the
     * client that requests it.
     * @param payload
     */
    protected topic_selftest(payload: Buffer): void;
    protected topic_acktest_ack(payload: Buffer): void;
    protected topic_acktest(payload: Buffer): void;
    addTask(topic_in: string, payload_in: Buffer): void;
    protected fixedDataProgessHandler(topic: string, payload: Buffer): number;
    protected fixedDataAckHandler(topic: string, payload: Buffer): boolean;
    protected fixedDataReceiveHandler(topic: string, payload: Buffer): Buffer | undefined;
}
export {};
