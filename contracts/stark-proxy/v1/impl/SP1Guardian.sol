pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {ILiquidityStakingV1} from '../../../interfaces/ILiquidityStakingV1.sol';
import {IStarkPerpetual} from '../../../interfaces/IStarkPerpetual.sol';
import {SP1Borrowing} from './SP1Borrowing.sol';
import {SP1Exchange} from './SP1Exchange.sol';

/**
 * @title SP1Guardian
 * @author dYdX
 *
 * @notice Actions which may be taken by the guardian. The guardian acts as a check to help ensure
 *  that borrowed funds are not misused, and that they are repaid as needed.
 */
abstract contract SP1Guardian is SP1Borrowing, SP1Exchange {
  // ============ Events ============

  event BorrowingRestrictionChanged(bool isBorrowingRestricted);

  // ============ Constructor ============

  constructor(
    ILiquidityStakingV1 liquidityStaking,
    IStarkPerpetual starkPerpetual,
    IERC20 token
  ) SP1Borrowing(liquidityStaking, token) SP1Exchange(starkPerpetual) {}

  // ============ External Functions ============

  /**
   * @notice Guardian method to restrict borrowing or depositing borrowed funds to the exchange.
   */
  function guardianSetBorrowingRestriction(bool isBorrowingRestricted)
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
    _IS_BORROWING_RESTRICTED_ = isBorrowingRestricted;
    emit BorrowingRestrictionChanged(isBorrowingRestricted);
  }

  /**
   * @notice Guardian method to repay this contract's borrowed balance, using this contract's funds.
   *
   * @param  amount  Amount to repay.
   */
  function guardianRepayLoan(uint256 amount) external nonReentrant onlyRole(GUARDIAN_ROLE) {
    _repayLoan(amount, true);
  }

  /**
   * @notice Guardian method to repay a debt balance in the case where the contract is in default.
   *
   * @param  amount  Amount to repay.
   */
  function guardianRepayDebt(uint256 amount) external nonReentrant onlyRole(GUARDIAN_ROLE) {
    _repayDebt(amount, true);
  }

  /**
   * @notice Guardian method to trigger a withdrawal. This will transfer funds from StarkPerpetual
   *  to this contract. This requires a (slow) withdrawal from L2 to have been previously processed.
   *
   *  Note: This function is intentionally not protected by the onlyAllowedKey modifier.
   *
   * @return The ERC20 token amount received by this contract.
   */
  function guardianWithdrawFromExchange(uint256 starkKey, uint256 assetType)
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
    returns (uint256)
  {
    return _withdrawFromExchange(starkKey, assetType, true);
  }

  /**
   * @notice Guardian method to make a forced withdrawal request.
   *  Reverts if the contract does not have a debt balance on the staking contract.
   *
   *  Note: This function is intentionally not protected by the onlyAllowedKey modifier.
   */
  function guardianForcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  ) external nonReentrant onlyRole(GUARDIAN_ROLE) {
    require(
      getDebtBalance() > 0,
      'SP1Guardian: Cannot call forced action if contract has no overdue debt'
    );
    _forcedWithdrawalRequest(
      starkKey,
      vaultId,
      quantizedAmount,
      premiumCost,
      true // isGuardianAction
    );
  }

  /**
   * @notice Guardian method to make a forced trade request.
   *  Reverts if the contract does not have a debt balance on the staking contract.
   *
   *  Note: This function is intentionally not protected by the onlyAllowedKey modifier.
   */
  function guardianForcedTradeRequest(uint256[12] calldata args, bytes calldata signature)
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
    require(
      getDebtBalance() > 0,
      'SP1Guardian: Cannot call forced action if contract has no overdue debt'
    );
    _forcedTradeRequest(args, signature, true);
  }
}
