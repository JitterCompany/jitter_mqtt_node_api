/// <reference types="node" />
export declare function getAckTopicName(topic: string): string;
export declare function createFixedDataPacket(data: Buffer, maxPacketSize: number): Buffer[];
export declare function checkCRC32(data: Buffer): boolean;
