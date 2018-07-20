/// <reference types="node" />
export declare namespace utils {
    function getAckTopicName(topic: string): string;
    function createFixedDataPacket(data: Buffer, maxPacketSize: number): Buffer[];
    function checkCRC32(data: Buffer): boolean;
    function randomSecret(n: number): string;
    function password_encoding(password: string): string;
    interface LoginCredentials {
        username: string;
        password: string;
        random: string;
    }
    function newMQttLoginCredentials(): LoginCredentials;
}
//# sourceMappingURL=utils.d.ts.map