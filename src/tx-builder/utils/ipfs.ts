import axios from 'axios';
import CID from 'cids';
import { BigNumber } from 'ethers';
import { base58 } from 'ethers/lib/utils';

import { IPFSProposalData, UserRewardBalances } from '../types/GovernanceReturnTypes';

const IPFS_ENDPOINT = 'https://cloudflare-ipfs.com/ipfs';

export function getLink(hash: string): string {
  return `${IPFS_ENDPOINT}/${hash}`;
}

interface MemorizeMetadata {
  [key: string]: IPFSProposalData;
}

const MEMORIZE: MemorizeMetadata = {};

export function ipfsHashBytesToIpfsHashString(ipfsHashBytes: string, isBytes32: boolean): string {
  const trimmedHexString: string = ipfsHashBytes.slice(2);
  if (isBytes32) {
    // bytes32 has the first two bytes (encoding) removed, so assumed it's base58 encoded
    return base58.encode(Buffer.from(`1220${trimmedHexString}`, 'hex'));
  } else {
    const buf = Buffer.from(trimmedHexString, 'hex');
    const cid = new CID(buf.toString());
    return cid.toV1().toString();
  }
}

export async function getProposalMetadata(
  ipfsHashBytes: string,
  ipfsTimeoutMs?: number,
): Promise<IPFSProposalData> {
  const ipfsHash = ipfsHashBytesToIpfsHashString(ipfsHashBytes, true);
  if (MEMORIZE[ipfsHash]) return MEMORIZE[ipfsHash];
  try {
    const { data } = await axios.get(getLink(ipfsHash), { timeout: ipfsTimeoutMs });

    if (!data?.title) {
      throw Error('Missing `title` field at proposal metadata.');
    }
    if (!data?.description) {
      throw Error('Missing `description` field at proposal metadata.');
    }

    if (!data?.shortDescription && !data['short description']) {
      throw Error('Missing `shortDescription` field at proposal metadata.');
    }

    MEMORIZE[ipfsHash] = {
      ipfsHash,
      dipId: data.DIP ? parseInt(data.DIP) : undefined,
      title: data.title,
      description: data.description,
      shortDescription: data.shortDescription || data['short description'],
    };
    return MEMORIZE[ipfsHash];
  } catch (e) {
    console.error(`@dydxfoundation/governance-js: IPFS fetch Error: ${e.message}`);
    return {
      ipfsHash,
      dipId: -1,
      title: `Proposal - ${ipfsHash}`,
      description: 'Proposal with invalid metadata format or IPFS gateway is down',
      shortDescription: 'Proposal with invalid metadata format or IPFS gateway is down',
    };
  }
}

export async function getMerkleTreeBalancesFromIpfs(
  ipfsHashBytes: string,
  ipfsTimeoutMs?: number,
): Promise<UserRewardBalances> {
  try {
    const ipfsHash: string = ipfsHashBytesToIpfsHashString(ipfsHashBytes, false);
    const { data } = await axios.get(getLink(ipfsHash), { timeout: ipfsTimeoutMs });
    const balances: UserRewardBalances = {};

    data.forEach((balance: [string, number]) => {
      const address: string = balance[0];
      const amount: BigNumber = BigNumber.from(balance[1]);
      balances[address] = amount;
    });

    return balances;
  } catch (e) {
    throw new Error('Could not fetch user reward balances from ipfs hash');
  }
}
