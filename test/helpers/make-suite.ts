import { evmRevert, evmSnapshot, DRE } from '../../helpers/misc-utils';
import { Signer } from 'ethers';
import { getEthersSigners } from '../../helpers/contracts-helpers';
import { tEthereumAddress } from '../../helpers/types';
import { NUM_STARK_PROXY_BORROWERS } from '../../helpers/constants';

import chai from 'chai';
// @ts-ignore
import bignumberChai from 'chai-bignumber';
import {
  getDydxIncentivesController,
  getATokenMock,
  getMintableErc20,
  getStakedDydxToken,
  getLiquidityStakingV1,
  getMockStakedToken,
  getBorrowerStarkProxy,
} from '../../helpers/contracts-accessors';
import { IncentivesController } from '../../types/IncentivesController';
import { MintableErc20 } from '../../types/MintableErc20';
import { ATokenMock } from '../../types/ATokenMock';
import { StakedDydxToken } from '../../types/StakedDydxToken';
import { LiquidityStakingV1 } from '../../types/LiquidityStakingV1';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { MockStakedToken } from '../../types/MockStakedToken';

chai.use(bignumberChai());

export let stakedDydxTokenInitializeTimestamp = 0;
export const setStakedDydxTokenInitializeTimestamp = (timestamp: number) => {
  stakedDydxTokenInitializeTimestamp = timestamp;
};

export interface SignerWithAddress {
  signer: Signer;
  address: tEthereumAddress;
}

export interface TestEnv {
  rewardsVault: SignerWithAddress;
  deployer: SignerWithAddress;
  guardian: SignerWithAddress;
  users: SignerWithAddress[];
  dydxToken: MintableErc20;
  incentivesController: IncentivesController;
  stakedDydxToken: StakedDydxToken;
  liquidityStakingV1: LiquidityStakingV1;
  starkProxyV1Borrowers: StarkProxyV1[];
  mockStakedToken: MockStakedToken;
  aDaiMock: ATokenMock;
  aWethMock: ATokenMock;
}

const testEnv: TestEnv = {
  rewardsVault: {} as SignerWithAddress,
  deployer: {} as SignerWithAddress,
  guardian: {} as SignerWithAddress,
  users: [] as SignerWithAddress[],
  dydxToken: {} as MintableErc20,
  stakedDydxToken: {} as StakedDydxToken,
  incentivesController: {} as IncentivesController,
  liquidityStakingV1: {} as LiquidityStakingV1,
  starkProxyV1Borrowers: [] as StarkProxyV1[],
  mockStakedToken: {} as MockStakedToken,
  aDaiMock: {} as ATokenMock,
  aWethMock: {} as ATokenMock,
} as TestEnv;

export async function initializeMakeSuite() {
  const [_deployer, _rewardsVault, ...restSigners] = await getEthersSigners();
  const deployer: SignerWithAddress = {
    address: await _deployer.getAddress(),
    signer: _deployer,
  };

  const rewardsVault: SignerWithAddress = {
    address: await _rewardsVault.getAddress(),
    signer: _rewardsVault,
  };

  const guardian: SignerWithAddress = {
    address: await restSigners[1].getAddress(),
    signer: restSigners[1],
  };

  for (const signer of restSigners) {
    testEnv.users.push({
      signer,
      address: await signer.getAddress(),
    });
  }
  testEnv.deployer = deployer;
  testEnv.rewardsVault = rewardsVault;
  testEnv.guardian = guardian;
  testEnv.stakedDydxToken = await getStakedDydxToken();
  testEnv.incentivesController = await getDydxIncentivesController();
  testEnv.dydxToken = await getMintableErc20();

  testEnv.liquidityStakingV1 = await getLiquidityStakingV1();

  const borrowers: StarkProxyV1[] = [];
  for (var i = 0; i < NUM_STARK_PROXY_BORROWERS; i++) {
    const borrowContract: StarkProxyV1 = await getBorrowerStarkProxy(i);
    borrowers.push(borrowContract);
  }
  testEnv.starkProxyV1Borrowers = borrowers;

  testEnv.mockStakedToken = await getMockStakedToken();

  // TODO(aTokens): Remove.
  testEnv.aDaiMock = await getATokenMock({ slug: 'aDai' });
  testEnv.aWethMock = await getATokenMock({ slug: 'aWeth' });
}

export function makeSuite(name: string, tests: (testEnv: TestEnv) => void) {
  let buidlerEvmSnapshotId: string = '0x1';
  describe(name, () => {
    before(async () => {
      const snapshotId = await evmSnapshot();
      if (DRE.network.name === 'hardhat') {
        buidlerEvmSnapshotId = snapshotId;
      }
    });
    tests(testEnv);
    after(async () => {
      await evmRevert(buidlerEvmSnapshotId);
    });
  });
}
