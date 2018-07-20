/// <reference types="node" />
export declare namespace utils {
    function getAckTopicName(topic: string): string;
    function createFixedDataPacket(data: Buffer, maxPacketSize: number): Buffer[];
    function checkCRC32(data: Buffer): boolean;
    function randomSecret(n: number): string;
    function password_encoding(password: string): string;
    function newMQttLoginCredentials(): {
        username: string;
        password: string;
        random: string;
    };
}
//# sourceMappingURL=utils.d.ts.map