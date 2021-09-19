import { signTypedData_v4 } from 'eth-sig-util';
import { fromRpcSig, ECDSASignature } from 'ethereumjs-util';

import config from '../../src/config';
import hre from '../hre';

export async function getChainIdForSigning(): Promise<number> {
  if (config.FORK_MAINNET) {
    return 1;
  }
  const network = await hre.ethers.provider.getNetwork();
  if (!network.chainId) {
    throw new Error(`Could not get chainId from network ${network}`);
  }
  return network.chainId;
}

export const buildPermitParams = (
  chainId: number,
  dydxTokenAddress: string,
  owner: string,
  spender: string,
  nonce: number,
  deadline: string,
  value: string,
  eip712DomainName: string = 'Staked DYDX',
) => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Permit: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  primaryType: 'Permit' as const,
  domain: {
    name: eip712DomainName,
    version: '1',
    chainId: chainId,
    verifyingContract: dydxTokenAddress,
  },
  message: {
    owner,
    spender,
    value,
    nonce,
    deadline,
  },
});

export const buildDelegateByTypeParams = (
  chainId: number,
  dydxTokenAddress: string,
  delegatee: string,
  type: string,
  nonce: string,
  expiry: string,
  eip712DomainName: string = 'Staked DYDX',
) => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    DelegateByType: [
      { name: 'delegatee', type: 'address' },
      { name: 'type', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
    ],
  },
  primaryType: 'DelegateByType' as const,
  domain: {
    name: eip712DomainName,
    version: '1',
    chainId: chainId,
    verifyingContract: dydxTokenAddress,
  },
  message: {
    delegatee,
    type,
    nonce,
    expiry,
  },
});

export const buildDelegateParams = (
  chainId: number,
  dydxTokenAddress: string,
  delegatee: string,
  nonce: string,
  expiry: string,
  eip712DomainName: string = 'Staked DYDX',
) => ({
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Delegate: [
      { name: 'delegatee', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' },
    ],
  },
  primaryType: 'Delegate' as const,
  domain: {
    name: eip712DomainName,
    version: '1',
    chainId: chainId,
    verifyingContract: dydxTokenAddress,
  },
  message: {
    delegatee,
    nonce,
    expiry,
  },
});

export const getSignatureFromTypedData = (
  privateKey: string,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  typedData: any,
): ECDSASignature => {
  const signature = signTypedData_v4(Buffer.from(privateKey.substring(2, 66), 'hex'), {
    data: typedData,
  });
  return fromRpcSig(signature);
};
