/**
 * Perform all deployments which were used in the dYdX governance mainnet deployment.
 */

import { deployPhase1 } from './phase-1';
import { deployPhase2 } from './phase-2';

type UnwrapPromise<T> = T extends Promise<infer U> ? U : never;

export type DeployedContracts = (
  UnwrapPromise<ReturnType<typeof deployPhase1>> &
  UnwrapPromise<ReturnType<typeof deployPhase2>>
);

export async function deployContracts(): Promise<DeployedContracts> {
  const phase1Contracts = await deployPhase1();
  const phase2Contracts = await deployPhase2({
    dydxTokenAddress: phase1Contracts.dydxToken.address,
    governorAddress: phase1Contracts.governor.address,
    shortTimelockAddress: phase1Contracts.shortTimelock.address,
    longTimelockAddress: phase1Contracts.longTimelock.address,
  });
  return {
    ...phase1Contracts,
    ...phase2Contracts,
  };
}
