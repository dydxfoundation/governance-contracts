import { BigNumber, BigNumberish } from 'ethers';

export function asBytes32(
  value: BigNumberish,
): string {
  const rawHex = stripHexPrefix(BigNumber.from(value).toHexString());
  return `0x${rawHex.padStart(64, '0')}`;
}

export function asUintHex(
  value: BigNumberish,
  bits: number,
): string {
  if (bits % 8 !== 0) {
    throw new Error(`asUintHex: Expected bits to be a multiple of 8 but got ${bits}`);
  }
  const hexChars = bits / 4;
  const rawHex = stripHexPrefix(BigNumber.from(value).toHexString());
  if (rawHex.length > hexChars) {
    throw new Error(`asUintHex: Value ${value} is out of range for ${bits} bits`);
  }
  return `0x${rawHex.padStart(hexChars, '0')}`;
}

export function concatHex(
  hexValues: string[],
): string {
  return `0x${hexValues.map(stripHexPrefix).join('')}`;
}

export function stripHexPrefix(
  hexValue: string,
): string {
  if (hexValue.startsWith('0x')) {
    return hexValue.slice(2);
  }
  return hexValue;
}
