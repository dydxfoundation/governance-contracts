// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { ILiquidityStakingV1 } from '../../../interfaces/ILiquidityStakingV1.sol';
import { IStarkPerpetual } from '../../../interfaces/IStarkPerpetual.sol';
import { SP1Borrowing } from './SP1Borrowing.sol';
import { SP1Exchange } from './SP1Exchange.sol';

/**
 * @title SP1Guardian
 * @author dYdX
 *
 * @dev Defines guardian powers, to be owned or delegated by dYdX governance.
 */
abstract contract SP1Guardian is
  SP1Borrowing,
  SP1Exchange
{
  using SafeMath for uint256;

  // ============ Events ============

  event BorrowingRestrictionChanged(
    bool isBorrowingRestricted
  );

  event GuardianVetoedForcedTradeRequest(
    bytes32 argsHash
  );

  event GuardianUpdateApprovedAmountForExternalWithdrawal(
    uint256 amount
  );

  // ============ Constructor ============

  constructor(
    ILiquidityStakingV1 liquidityStaking,
    IStarkPerpetual starkPerpetual,
    IERC20 token
  )
    SP1Borrowing(liquidityStaking, token)
    SP1Exchange(starkPerpetual)
  {}

  // ============ External Functions ============

  /**
   * @notice Approve an additional amount for external withdrawal by WITHDRAWAL_OPERATOR_ROLE.
   *
   * @param  amount  The additional amount to approve for external withdrawal.
   *
   * @return The new amount approved for external withdrawal.
   */
  function increaseApprovedAmountForExternalWithdrawal(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
    returns (uint256)
  {
    uint256 newApprovedAmount = _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_.add(
      amount
    );
    _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_ = newApprovedAmount;
    emit GuardianUpdateApprovedAmountForExternalWithdrawal(newApprovedAmount);
    return newApprovedAmount;
  }

  /**
   * @notice Set the approved amount for external withdrawal to zero.
   *
   * @return The amount that was previously approved for external withdrawal.
   */
  function resetApprovedAmountForExternalWithdrawal()
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
    returns (uint256)
  {
    uint256 previousApprovedAmount = _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_;
    _APPROVED_AMOUNT_FOR_EXTERNAL_WITHDRAWAL_ = 0;
    emit GuardianUpdateApprovedAmountForExternalWithdrawal(0);
    return previousApprovedAmount;
  }

  /**
   * @notice Guardian method to restrict borrowing or depositing borrowed funds to the exchange.
   */
  function guardianSetBorrowingRestriction(
    bool isBorrowingRestricted
  )
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
  function guardianRepayBorrow(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
    _repayBorrow(amount, true);
  }

  /**
   * @notice Guardian method to repay a debt balance owed by the borrower.
   *
   * @param  amount  Amount to repay.
   */
  function guardianRepayDebt(
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
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
  function guardianWithdrawFromExchange(
    uint256 starkKey,
    uint256 assetType
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
    returns (uint256)
  {
    return _withdrawFromExchange(starkKey, assetType, true);
  }

  /**
   * @notice Guardian method to trigger a forced withdrawal request.
   *  Reverts if the borrower has no overdue debt.
   *
   *  Note: This function is intentionally not protected by the onlyAllowedKey modifier.
   */
  function guardianForcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
    require(
      getDebtBalance() > 0,
      'SP1Guardian: Cannot call forced action if borrower has no overdue debt'
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
   * @notice Guardian method to trigger a forced trade request.
   *  Reverts if the borrower has no overdue debt.
   *
   *  Note: This function is intentionally not protected by the onlyAllowedKey modifier.
   */
  function guardianForcedTradeRequest(
    uint256[12] calldata args,
    bytes calldata signature
  )
    external
    nonReentrant
    onlyRole(GUARDIAN_ROLE)
  {
    require(
      getDebtBalance() > 0,
      'SP1Guardian: Cannot call forced action if borrower has no overdue debt'
    );
    _forcedTradeRequest(args, signature, true);
  }

  /**
   * @notice Guardian method to prevent queued forced trade requests from being executed.
   *
   *  May only be called by VETO_GUARDIAN_ROLE.
   *
   * @param  argsHashes  An array of hashes for each forced trade request to veto.
   */
  function guardianVetoForcedTradeRequests(
    bytes32[] calldata argsHashes
  )
    external
    nonReentrant
    onlyRole(VETO_GUARDIAN_ROLE)
  {
    for (uint256 i = 0; i < argsHashes.length; i++) {
      bytes32 argsHash = argsHashes[i];
      _QUEUED_FORCED_TRADE_TIMESTAMPS_[argsHash] = 0;
      emit GuardianVetoedForcedTradeRequest(argsHash);
    }
  }
}
