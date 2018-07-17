import { crc32 } from 'crc';


export function getAckTopicName(topic: string) {
  return 't' + topic.slice(1) + '/ack';
}

export function createFixedDataPacket(data: Buffer, maxPacketSize: number) {

  const checksum = new Buffer(4);
  checksum.writeUInt32LE(crc32(data), 0);
  data = Buffer.concat([data, checksum]);

  let N = Math.floor(data.byteLength / maxPacketSize);
  if (data.byteLength % maxPacketSize) {
    N += 1;
  }

  const packets: Buffer[] = [];
  const header = new Buffer(4);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(N, 2);
  for (let i = 0; i < N; i++) {
    header.writeUInt16LE(i, 0);
    packets.push(Buffer.concat([
      header,
      data.slice(i * maxPacketSize, (i + 1) * maxPacketSize)
    ]));
  }

  return packets;

}

export function checkCRC32(data: Buffer) {
  const N = data.byteLength;
  if (N) {
    const checksum = data.readUInt32LE(N - 4);
    return checksum === crc32(data.slice(0, N - 4));
  }
  return false;
}
