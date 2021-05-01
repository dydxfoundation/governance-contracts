import BigNumber from 'bignumber.js';
import rawBRE from 'hardhat';
import { Signer, ethers } from 'ethers';
import { getEthersSigners } from '../helpers/contracts-helpers';
import { initializeMakeSuite } from './helpers/make-suite';
import {
  deployMintableErc20,
  deployATokenMock,
  deployMockStarkPerpetual,
  getLiquidityStakingV1,
} from '../helpers/contracts-accessors';
import { NUM_STARK_PROXY_BORROWERS } from '../helpers/constants';
import { waitForTx } from '../helpers/misc-utils';
import { MintableErc20 } from '../types/MintableErc20';
import {
  testDeployStakedDydxToken,
  testDeployLiquidityStakingV1,
  testDeployStarkProxyV1,
} from './helpers/deploy';
import { eContractid, tEthereumAddress } from '../helpers/types';
import { MockStarkPerpetual } from '../types/MockStarkPerpetual';

const topUpWalletsWithDydxToken = async (
  wallets: Signer[],
  dydxToken: MintableErc20,
  amount: string
) => {
  for (const wallet of wallets) {
    await waitForTx(await dydxToken.connect(wallet).mint(amount));
  }
};

const buildTestEnv = async (deployer: Signer, rewardsVault: Signer, restWallets: Signer[]) => {
  console.time('setup');

  const dydxToken = await deployMintableErc20(['dYdX Token', 'DYDX', 18]);

  // Mint DYDX tokens.
  const dydxTokenRewards: ethers.BigNumber = ethers.utils.parseEther('1000000');
  await waitForTx(await dydxToken.connect(rewardsVault).mint(dydxTokenRewards));
  await topUpWalletsWithDydxToken(
    restWallets.slice(0, 6),
    dydxToken,
    ethers.utils.parseEther('100').toString()
  );

  const { incentivesControllerProxy } = await testDeployStakedDydxToken(
    dydxToken,
    deployer,
    rewardsVault,
    restWallets
  );

  const { liquidityStakingV1Proxy, mockStakedToken } = await testDeployLiquidityStakingV1(
    dydxToken.address,
    await rewardsVault.getAddress(),
    restWallets
  );

  // approve liquidityStakingV1Proxy to take 100% of funds from rewardsVault
  dydxToken.connect(rewardsVault).approve(liquidityStakingV1Proxy.address, dydxTokenRewards);

  const mockStarkPerpetual: MockStarkPerpetual = await deployMockStarkPerpetual(
    mockStakedToken.address
  );
  const guardianAddress: tEthereumAddress = await restWallets[1].getAddress();
  const liquidityStakingV1 = await getLiquidityStakingV1();

  for (var i = 0; i < NUM_STARK_PROXY_BORROWERS; i++) {
    // deploy stark proxy for each borrower
    await testDeployStarkProxyV1(
      liquidityStakingV1,
      mockStarkPerpetual,
      mockStakedToken,
      guardianAddress,
      i,
      restWallets
    );
  }

  // TODO(aTokens): Remove.
  await deployATokenMock(incentivesControllerProxy.address, 'aDai');
  await deployATokenMock(incentivesControllerProxy.address, 'aWeth');

  console.timeEnd('setup');
};

before(async () => {
  await rawBRE.run('set-dre');
  const [deployer, rewardsVault, ...restWallets] = await getEthersSigners();
  console.log('-> Deploying test environment...');
  await buildTestEnv(deployer, rewardsVault, restWallets);
  await initializeMakeSuite();
  console.log('\n***************');
  console.log('Setup and snapshot finished');
  console.log('***************\n');
});
