import {
  BigNumber,
  BigNumberish,
} from 'ethers';

import hre from '../hre';
import { StakingHelper } from './staking-helper';

export async function evmSnapshot(): Promise<string> {
  return hre.ethers.provider.send('evm_snapshot', []);
}

export async function evmReset(
  id: string,
): Promise<void> {
  await hre.ethers.provider.send('evm_revert', [id]);
}

export async function saveSnapshot(
  snapshots: Map<string, string>,
  label: string,
  contract?: StakingHelper,
): Promise<void> {
  snapshots.set(label, await evmSnapshot());
  contract?.saveSnapshot(label);
}

export async function loadSnapshot(
  snapshots: Map<string, string>,
  label: string,
  contract?: StakingHelper,
): Promise<void> {
  const snapshot = snapshots.get(label);
  if (!snapshot) {
    throw new Error(`Cannot load since snapshot has not been saved: ${label}`);
  }
  await evmReset(snapshot);
  snapshots.set(label, await evmSnapshot());
  contract?.loadSnapshot(label);
}

export async function latestBlockTimestamp() {
  const block = await hre.ethers.provider.getBlock('latest');
  return block.timestamp;
}

export async function latestBlock() {
  const block = await hre.ethers.provider.getBlock('latest');
  return block.number;
}

export async function advanceBlock(
  timestamp?: number,
) {
  return hre.ethers.provider.send('evm_mine', timestamp ? [timestamp] : []);
}

export async function advanceBlockTo(
  target: number,
) {
  const currentBlock = await latestBlock();
  const start = Date.now();
  if (target < currentBlock) {
    throw Error(`Target block #(${target}) is lower than current block #(${currentBlock})`);
  }
  let notified = false;
  while ((await latestBlock()) < target) {
    if (!notified && Date.now() - start >= 5000) {
      notified = true;
      console.log('advanceBlockTo: Advancing too many blocks is causing this test to be slow.');
    }
    await advanceBlock();
  }
}

export async function increaseTime(
  secondsToIncrease: number,
) {
  await hre.ethers.provider.send('evm_increaseTime', [secondsToIncrease]);
}

export async function increaseTimeAndMine(
  secondsToIncrease: number,
) {
  await hre.ethers.provider.send('evm_increaseTime', [secondsToIncrease]);
  await hre.ethers.provider.send('evm_mine', []);
}

export async function incrementTimeToTimestamp(
  timestamp: BigNumberish,
): Promise<void> {
  const latestTimestamp = await latestBlockTimestamp();
  const timestampBN = BigNumber.from(timestamp);
  if (latestTimestamp > timestampBN.toNumber()) {
    throw new Error('incrementTimeToTimestamp: Cannot move backwards in time');
  }
  const timestampDiff = timestampBN.sub(latestTimestamp).toNumber();
  await increaseTimeAndMine(timestampDiff);
}
