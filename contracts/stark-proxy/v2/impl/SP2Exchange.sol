// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { IStarkPerpetual } from '../../../interfaces/IStarkPerpetual.sol';
import { SP1Balances } from '../../v1/impl/SP1Balances.sol';

/**
 * @title SP2Exchange
 * @author dYdX
 *
 * @dev Handles calls to the StarkPerpetual contract, for interacting with the dYdX L2 exchange.
 *
 *  Standard exchange operation is handled by EXCHANGE_OPERATOR_ROLE. The “forced” actions can only
 *  be called by the OWNER_ROLE or GUARDIAN_ROLE. Some other functions are also callable by
 *  the GUARDIAN_ROLE.
 *
 *  See SP1Roles, SP2Guardian, SP2Owner, and SP2Withdrawals.
 */
abstract contract SP2Exchange is
  SP1Balances
{
  using SafeMath for uint256;

  // ============ Constants ============

  IStarkPerpetual public immutable STARK_PERPETUAL;

  // ============ Events ============

  event DepositedToExchange(
    uint256 starkKey,
    uint256 starkAssetType,
    uint256 starkVaultId,
    uint256 tokenAmount
  );

  event WithdrewFromExchange(
    uint256 starkKey,
    uint256 starkAssetType,
    uint256 tokenAmount,
    bool isGuardianAction
  );

  /// @dev Limited fields included. Details can be retrieved from Starkware logs if needed.
  event RequestedForcedWithdrawal(
    uint256 starkKey,
    uint256 vaultId,
    bool isGuardianAction
  );

  /// @dev Limited fields included. Details can be retrieved from Starkware logs if needed.
  event RequestedForcedTrade(
    uint256 starkKey,
    uint256 vaultId,
    bool isGuardianAction
  );

  event DepositCanceled(
    uint256 starkKey,
    uint256 starkAssetType,
    uint256 vaultId,
    bool isGuardianAction
  );

  event DepositReclaimed(
    uint256 starkKey,
    uint256 starkAssetType,
    uint256 vaultId,
    uint256 fundsReclaimed,
    bool isGuardianAction
  );

  // ============ Constructor ============

  constructor(
    IStarkPerpetual starkPerpetual
  ) {
    STARK_PERPETUAL = starkPerpetual;
  }

  // ============ External Functions ============

  /**
   * @notice Deposit funds to the exchange.
   *
   *  IMPORTANT: The caller is responsible for providing `quantizedAmount` in the right units.
   *             Currently, the exchange collateral is USDC, denominated in ERC20 token units, but
   *             this could change.
   *
   * @param  starkKey         The STARK key of the account. Must be authorized by OWNER_ROLE.
   * @param  assetType        The exchange asset ID for the asset to deposit.
   * @param  vaultId          The exchange position ID for the account to deposit to.
   * @param  quantizedAmount  The deposit amount denominated in the exchange base units.
   *
   * @return The ERC20 token amount spent.
   */
  function depositToExchange(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    uint256 quantizedAmount
  )
    external
    nonReentrant
    onlyRole(EXCHANGE_OPERATOR_ROLE)
    onlyAllowedKey(starkKey)
    returns (uint256)
  {
    // Deposit and get the deposited token amount.
    uint256 startingBalance = getTokenBalance();
    STARK_PERPETUAL.deposit(starkKey, assetType, vaultId, quantizedAmount);
    uint256 endingBalance = getTokenBalance();
    uint256 tokenAmount = startingBalance.sub(endingBalance);

    // Disallow depositing borrowed funds to the exchange if the guardian has restricted borrowing.
    if (_IS_BORROWING_RESTRICTED_) {
      require(
        endingBalance >= getBorrowedAndDebtBalance(),
        'SP2Exchange: Cannot deposit borrowed funds to the exchange while Restricted'
      );
    }

    emit DepositedToExchange(starkKey, assetType, vaultId, tokenAmount);
    return tokenAmount;
  }

  /**
   * @notice Trigger a withdrawal of account funds held in the exchange contract. This can be
   *  called after a (slow) withdrawal has already been processed by the L2 exchange.
   *
   * @param  starkKey   The STARK key of the account. Must be authorized by OWNER_ROLE.
   * @param  assetType  The exchange asset ID for the asset to withdraw.
   *
   * @return The ERC20 token amount received by this contract.
   */
  function withdrawFromExchange(
    uint256 starkKey,
    uint256 assetType
  )
    external
    nonReentrant
    onlyRole(EXCHANGE_OPERATOR_ROLE)
    onlyAllowedKey(starkKey)
    returns (uint256)
  {
    return _withdrawFromExchange(starkKey, assetType, false);
  }

  // ============ Internal Functions ============

  function _withdrawFromExchange(
    uint256 starkKey,
    uint256 assetType,
    bool isGuardianAction
  )
    internal
    returns (uint256)
  {
    uint256 startingBalance = getTokenBalance();
    STARK_PERPETUAL.withdraw(starkKey, assetType);
    uint256 endingBalance = getTokenBalance();
    uint256 tokenAmount = endingBalance.sub(startingBalance);
    emit WithdrewFromExchange(starkKey, assetType, tokenAmount, isGuardianAction);
    return tokenAmount;
  }

  function _forcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost,
    bool isGuardianAction
  )
    internal
  {
    STARK_PERPETUAL.forcedWithdrawalRequest(starkKey, vaultId, quantizedAmount, premiumCost);
    emit RequestedForcedWithdrawal(starkKey, vaultId, isGuardianAction);
  }

  function _forcedTradeRequest(
    uint256[12] calldata args,
    bytes calldata signature,
    bool isGuardianAction
  )
    internal
  {
    // Split into two functions to avoid error 'call stack too deep'.
    if (args[11] != 0) {
      _forcedTradeRequestPremiumCostTrue(args, signature);
    } else {
      _forcedTradeRequestPremiumCostFalse(args, signature);
    }
    emit RequestedForcedTrade(
      args[0], // starkKeyA
      args[2], // vaultIdA
      isGuardianAction
    );
  }

  function _depositCancel(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    bool isGuardianAction
  )
    internal 
  {
    STARK_PERPETUAL.depositCancel(starkKey, assetType, vaultId);
    emit DepositCanceled(starkKey, assetType, vaultId, isGuardianAction);
  }

  function _depositReclaim(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId,
    bool isGuardianAction
  )
    internal 
  {
    uint256 startingBalance = getTokenBalance();
    STARK_PERPETUAL.depositReclaim(starkKey, assetType, vaultId);
    uint256 endingBalance = getTokenBalance();
    uint256 tokenAmount = endingBalance.sub(startingBalance);
    emit DepositReclaimed(
      starkKey,
      assetType,
      vaultId,
      tokenAmount,
      isGuardianAction
    );
  }

  // ============ Private Functions ============

  // Split into two functions to avoid error 'call stack too deep'.
  function _forcedTradeRequestPremiumCostTrue(
    uint256[12] calldata args,
    bytes calldata signature
  )
    private
  {
    STARK_PERPETUAL.forcedTradeRequest(
      args[0],      // starkKeyA
      args[1],      // starkKeyB
      args[2],      // vaultIdA
      args[3],      // vaultIdB
      args[4],      // collateralAssetId
      args[5],      // syntheticAssetId
      args[6],      // amountCollateral
      args[7],      // amountSynthetic
      args[8] != 0, // aIsBuyingSynthetic
      args[9],      // submissionExpirationTime
      args[10],     // nonce
      signature,
      true          // premiumCost
    );
  }

  // Split into two functions to avoid error 'call stack too deep'.
  function _forcedTradeRequestPremiumCostFalse(
    uint256[12] calldata args,
    bytes calldata signature
  )
    private
  {
    STARK_PERPETUAL.forcedTradeRequest(
      args[0],      // starkKeyA
      args[1],      // starkKeyB
      args[2],      // vaultIdA
      args[3],      // vaultIdB
      args[4],      // collateralAssetId
      args[5],      // syntheticAssetId
      args[6],      // amountCollateral
      args[7],      // amountSynthetic
      args[8] != 0, // aIsBuyingSynthetic
      args[9],      // submissionExpirationTime
      args[10],     // nonce
      signature,
      false         // premiumCost
    );
  }
}
