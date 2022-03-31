import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';

import { getRole } from '../../src/lib/util';
import { deployStarkProxyV3 } from '../../src/migrations/deploy-stark-proxy-v3';
import { impersonateAndFundAccount } from '../../src/migrations/helpers/impersonate-account';
import { DelegationType, NetworkName, Role } from '../../src/types';
import {
  DydxToken,
  Executor,
  IStarkPerpetual,
  LiquidityStakingV1,
  MerkleDistributorV1,
  ProxyAdmin,
  SafetyModuleV1,
} from '../../types';
import { StarkProxyV3__factory } from '../../types/factories/StarkProxyV3__factory';
import { StarkProxyV3 } from '../../types/StarkProxyV3';
import {
  TestContext,
  describeContractForNetwork,
  describeContract,
} from '../helpers/describe-contract';
import { findAddressWithRole } from '../helpers/get-address-with-role';


// Contracts
let dydxToken: DydxToken;
let liquidityStaking: LiquidityStakingV1;
let merkleDistributor: MerkleDistributorV1;
let merklePauserTimelock: Executor;
let safetyModule: SafetyModuleV1;
let shortTimelock: Executor;
let starkPerpetual: IStarkPerpetual;
let deployer: SignerWithAddress;

let borrower: SignerWithAddress;
let delegateeAddress: string;
let anotherDelegateeAddress: string;

let spProxyAdmin: ProxyAdmin;
let starkProxyV3Borrower: StarkProxyV3;
let starkProxyV3Deployer: StarkProxyV3;

async function init(ctx: TestContext): Promise<void> {
  ({
    dydxToken,
    liquidityStaking,
    merkleDistributor,
    merklePauserTimelock,
    safetyModule,
    shortTimelock,
    starkPerpetual,
    deployer,
  } = ctx);
  
  delegateeAddress = ctx.starkProxies[0].address;
  anotherDelegateeAddress = ctx.starkProxies[1].address;

  const ownerAddress = await findAddressWithRole(ctx.starkProxies[0], Role.OWNER_ROLE);
  borrower = await impersonateAndFundAccount(ownerAddress);

  const {
    starkProxyContract,
    starkProxyProxyAdmin,
  } = await deployStarkProxyV3({
    dydxCollateralTokenAddress: dydxToken.address,
    liquidityStakingAddress: liquidityStaking.address,
    merkleDistributorAddress: merkleDistributor.address,
    merkleTimelockAddress: merklePauserTimelock.address,
    shortTimelockAddress: shortTimelock.address,
    starkPerpetualAddress: starkPerpetual.address,

    borrowerAddress: borrower.address,
  });

  if (starkProxyContract === undefined || starkProxyProxyAdmin === undefined) {
    // forcing type for rest of test.
    expect(starkProxyContract).is.not.undefined();
    expect(starkProxyProxyAdmin).is.not.undefined();
    return;
  }

  spProxyAdmin = starkProxyProxyAdmin;
  starkProxyV3Borrower = new StarkProxyV3__factory(borrower).attach(starkProxyContract.address);
  starkProxyV3Deployer = new StarkProxyV3__factory(deployer).attach(starkProxyContract.address);
}

describeContract('SP3Owner', init, (ctx: TestContext) => {
  describeContractForNetwork(
    'SP3Owner Hardhat Tests',
    ctx,
    NetworkName.hardhat,
    true,
    () => {
      it('Borrower (OWNER_ROLE) can delegate DYDX and staked DYDX token', async () => {
        await Promise.all([
          starkProxyV3Borrower.delegate(dydxToken.address, delegateeAddress),
          starkProxyV3Borrower.delegate(safetyModule.address, anotherDelegateeAddress),
        ]);

        expect(
          await dydxToken.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.VOTING_POWER),
        ).to.equal(delegateeAddress);
        expect(
          await dydxToken.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(delegateeAddress);

        expect(
          await safetyModule.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.VOTING_POWER),
        ).to.equal(anotherDelegateeAddress);
        expect(
          await safetyModule.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(anotherDelegateeAddress);
      });

      it('Borrower (OWNER_ROLE) can delegateByType DYDX and staked DYDX token', async () => {
        await Promise.all([
          starkProxyV3Borrower.delegateByType(
            dydxToken.address,
            delegateeAddress,
            DelegationType.VOTING_POWER,
          ),
          starkProxyV3Borrower.delegateByType(
            safetyModule.address,
            anotherDelegateeAddress,
            DelegationType.PROPOSITION_POWER,
          ),
        ]);

        expect(
          await dydxToken.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.VOTING_POWER),
        ).to.equal(delegateeAddress);
        expect(
          await dydxToken.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(starkProxyV3Borrower.address);

        expect(
          await safetyModule.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.VOTING_POWER),
        ).to.equal(starkProxyV3Borrower.address);
        expect(
          await safetyModule.getDelegateeByType(starkProxyV3Borrower.address, DelegationType.PROPOSITION_POWER),
        ).to.equal(anotherDelegateeAddress);
      });

      it('Deployer (not OWNER_ROLE) cannot delegate or delegateByType', async () => {
        expect(
          await starkProxyV3Deployer.hasRole(getRole(Role.OWNER_ROLE), deployer.address),
        ).to.be.false();
        
        const accessControlError = `AccessControl: account ${deployer.address.toLowerCase()} is missing role ${getRole(Role.OWNER_ROLE)}`;
        
        await expect(
          starkProxyV3Deployer.delegate(dydxToken.address, delegateeAddress),
        ).to.be.revertedWith(accessControlError);
        await expect(
          starkProxyV3Deployer.delegate(safetyModule.address, delegateeAddress),
        ).to.be.revertedWith(accessControlError);

        await expect(
          starkProxyV3Deployer.delegateByType(
            dydxToken.address,
            delegateeAddress,
            DelegationType.VOTING_POWER,
          ),
        ).to.be.revertedWith(accessControlError);
        await expect(
          starkProxyV3Deployer.delegateByType(
            safetyModule.address,
            anotherDelegateeAddress,
            DelegationType.PROPOSITION_POWER,
          ),
        ).to.be.revertedWith(accessControlError);
      });

      it('Roles granted and revoked correctly', async () => {
        // starkProxyContract.grantRole(getRole(Role.GUARDIAN_ROLE), shortTimelockAddress),
        // starkProxyContract.grantRole(getRole(Role.VETO_GUARDIAN_ROLE), merkleTimelockAddress),
        // starkProxyContract.grantRole(getRole(Role.OWNER_ROLE), borrowerAddress),
        // starkProxyContract.grantRole(getRole(Role.DELEGATION_ADMIN_ROLE), borrowerAddress),
        // starkProxyContract.grantRole(getRole(Role.WITHDRAWAL_OPERATOR_ROLE), borrowerAddress),
        // starkProxyContract.grantRole(getRole(Role.BORROWER_ROLE), borrowerAddress),
        // starkProxyContract.grantRole(getRole(Role.EXCHANGE_OPERATOR_ROLE), borrowerAddress),
        const grantedRoles: [string, string][] = [
          [getRole(Role.GUARDIAN_ROLE), shortTimelock.address],
          [getRole(Role.VETO_GUARDIAN_ROLE), merklePauserTimelock.address],
          [getRole(Role.OWNER_ROLE), borrower.address],
          [getRole(Role.DELEGATION_ADMIN_ROLE), borrower.address],
          [getRole(Role.WITHDRAWAL_OPERATOR_ROLE), borrower.address],
          [getRole(Role.BORROWER_ROLE), borrower.address],
          [getRole(Role.EXCHANGE_OPERATOR_ROLE), borrower.address],
        ];

        for (const [role, address] of grantedRoles) {
          expect(
            await starkProxyV3Borrower.hasRole(role, address),
          ).to.be.true();
        }

        // await starkProxyContract.revokeRole(getRole(Role.DELEGATION_ADMIN_ROLE), deployerAddress),
        // await starkProxyContract.revokeRole(getRole(Role.OWNER_ROLE), deployerAddress),
        // await starkProxyContract.revokeRole(getRole(Role.GUARDIAN_ROLE), deployerAddress),
        const revokedRoles: [string, string][] = [
          [getRole(Role.DELEGATION_ADMIN_ROLE), deployer.address],
          [getRole(Role.OWNER_ROLE), deployer.address],
          [getRole(Role.GUARDIAN_ROLE), deployer.address],
        ];

        for (const [role, address] of revokedRoles) {
          expect(
            await starkProxyV3Borrower.hasRole(role, address),
          ).to.be.false();
        }

        // await waitForTx(await starkProxyProxyAdmin.transferOwnership(shortTimelockAddress));
        expect(await spProxyAdmin.owner()).to.equal(shortTimelock.address);
      });
    });
});
