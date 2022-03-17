import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import { getRole } from '../../src/lib/util';
import { deployStarkProxyV3 } from '../../src/migrations/deploy-stark-proxy-v3';
import { DelegationType, NetworkName, Role } from '../../src/types';
import {
  DydxToken,
  IStarkPerpetual,
  LiquidityStakingV1,
  MerkleDistributorV1,
  SafetyModuleV1,
} from '../../types';
import { StarkProxyV3__factory } from '../../types/factories/StarkProxyV3__factory';
import { StarkProxyV1 } from '../../types/StarkProxyV1';
import { StarkProxyV3 } from '../../types/StarkProxyV3';
import {
  TestContext,
  describeContractForNetwork,
  describeContract,
} from '../helpers/describe-contract';


// Contracts
let dydxToken: DydxToken;
let liquidityStaking: LiquidityStakingV1;
let merkleDistributor: MerkleDistributorV1;
let safetyModule: SafetyModuleV1;
let starkPerpetual: IStarkPerpetual;
let deployer: SignerWithAddress;

let delegateeAddress: string;
let anotherDelegateeAddress: string;

function init(ctx: TestContext): void {
  ({
    dydxToken,
    liquidityStaking,
    merkleDistributor,
    safetyModule,
    starkPerpetual,
    deployer,
  } = ctx);
  
  delegateeAddress = ctx.starkProxies[0].address;
  anotherDelegateeAddress = ctx.starkProxies[1].address;
}

describeContract('SP3Owner', init, (ctx: TestContext) => {
  describeContractForNetwork(
    'SP3Owner Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('OWNER_ROLE can delegate DYDX and staked DYDX token', async () => {
        const starkProxyV1WithV3Impl: StarkProxyV1 = (await deployStarkProxyV3({
          liquidityStakingAddress: liquidityStaking.address,
          merkleDistributorAddress: merkleDistributor.address,
          starkPerpetualAddress: starkPerpetual.address,
          dydxCollateralTokenAddress: dydxToken.address,
        })).starkProxyV1WithV3Impl;
        const starkProxyV3: StarkProxyV3 = new StarkProxyV3__factory(deployer).attach(starkProxyV1WithV3Impl.address);

        await Promise.all([
          starkProxyV3.delegate(
            dydxToken.address,
            delegateeAddress,
          ),
          starkProxyV3.delegate(
            safetyModule.address,
            anotherDelegateeAddress,
          ),
        ]);

        expect(
          await dydxToken.getDelegateeByType(starkProxyV3.address, DelegationType.VOTING_POWER),
        ).to.equal(delegateeAddress);
        expect(
          await dydxToken.getDelegateeByType(starkProxyV3.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(delegateeAddress);

        expect(
          await safetyModule.getDelegateeByType(starkProxyV3.address, DelegationType.VOTING_POWER),
        ).to.equal(anotherDelegateeAddress);
        expect(
          await safetyModule.getDelegateeByType(starkProxyV3.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(anotherDelegateeAddress);
      });

      it('OWNER_ROLE can delegateByType DYDX and staked DYDX token', async () => {
        const starkProxyV1WithV3Impl: StarkProxyV1 = (await deployStarkProxyV3({
          liquidityStakingAddress: liquidityStaking.address,
          merkleDistributorAddress: merkleDistributor.address,
          starkPerpetualAddress: starkPerpetual.address,
          dydxCollateralTokenAddress: dydxToken.address,
        })).starkProxyV1WithV3Impl;
        const starkProxyV3: StarkProxyV3 = new StarkProxyV3__factory(deployer).attach(starkProxyV1WithV3Impl.address);

        await Promise.all([
          starkProxyV3.delegateByType(
            dydxToken.address,
            delegateeAddress,
            DelegationType.VOTING_POWER,
          ),
          starkProxyV3.delegateByType(
            safetyModule.address,
            anotherDelegateeAddress,
            DelegationType.PROPOSITION_POWER,
          ),
        ]);

        expect(
          await dydxToken.getDelegateeByType(starkProxyV3.address, DelegationType.VOTING_POWER),
        ).to.equal(delegateeAddress);
        expect(
          await dydxToken.getDelegateeByType(starkProxyV3.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(starkProxyV3.address);

        expect(
          await safetyModule.getDelegateeByType(starkProxyV3.address, DelegationType.VOTING_POWER),
        ).to.equal(starkProxyV3.address);
        expect(
          await safetyModule.getDelegateeByType(starkProxyV3.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(anotherDelegateeAddress);
      });

      it('OWNER_ROLE can be set to another address', async () => {
        const starkProxyV1WithV3Impl: StarkProxyV1 = (await deployStarkProxyV3({
          liquidityStakingAddress: liquidityStaking.address,
          merkleDistributorAddress: merkleDistributor.address,
          starkPerpetualAddress: starkPerpetual.address,
          dydxCollateralTokenAddress: dydxToken.address,
          ownerRoleAddress: delegateeAddress,
        })).starkProxyV1WithV3Impl;
        const starkProxyV3: StarkProxyV3 = new StarkProxyV3__factory(deployer).attach(starkProxyV1WithV3Impl.address);

        const ownerRoleChanged: boolean = await starkProxyV3.hasRole(
          getRole(Role.OWNER_ROLE),
          delegateeAddress,
        );
        expect(ownerRoleChanged).to.be.true();
      });
    });
});
