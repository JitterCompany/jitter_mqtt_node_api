/// <reference types="node" />
import * as mqtt from 'mqtt';
import { MQTTTest, MQTTAckTest } from './mqtt-protocol-test';
export declare type TopicHandlerWorker = (username: string, payload: Buffer, worker: MQTTWorker) => void;
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
/**
 * MQTTWorker class
 *
 * This class implements queueing and executing topic handlers within a Fiber, as well as handling of
 * the FixedData protocol.
 */
export declare class MQTTWorker {
    protected username: string;
    protected mqtt_client: mqtt.MqttClient;
    protected max_packet_size: number;
    private queue;
    private workerRunning;
    private topicReceiveState;
    private topicSendState;
    protected test: MQTTTest | undefined;
    protected ackTest: MQTTAckTest | undefined;
    constructor(username: string, mqtt_client: mqtt.MqttClient, max_packet_size: number);
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