import BigNumber from 'bignumber.js';
import { BigNumber as EthersBigNumber } from 'ethers';

export const parseNumberToString = (value: string, decimals: number): string => {
  return new BigNumber(value)
    .multipliedBy(new BigNumber(10).pow(decimals))
    .toFixed(0);
};

export const parseNumberToEthersBigNumber = (value: string, decimals: number): EthersBigNumber => {
  return EthersBigNumber.from(parseNumberToString(value, decimals).toString());
};

export const canBeEnsAddress = (ensAddress: string): boolean => {
  return ensAddress.toLowerCase().endsWith('.eth');
};
