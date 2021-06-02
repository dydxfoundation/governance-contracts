pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {IStarkPerpetual} from '../../../interfaces/IStarkPerpetual.sol';
import {SafeMath} from '../../../lib/SafeMath.sol';
import {SP1Balances} from './SP1Balances.sol';

/**
 * @title SP1Exchange
 * @author dYdX
 *
 * @notice Handles calls to the StarkPerpetual contract, for interacting with the dYdX L2 exchange.
 *
 *  Most of these are controlled by EXCHANGE_ROLE. The “forced” actions, however, are controlled by
 *  FUNDS_ADMIN_ROLE as they directly impact the financial risk of positions held on the exchange.
 *  Some of these functions may also be called by GUARDIAN_ROLE.
 *
 *  See SP1Roles, SP1FundsAdmin, and SP1Guardian for details.
 */
abstract contract SP1Exchange is SP1Balances {
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
  event RequestedForcedWithdrawal(uint256 starkKey, uint256 vaultId, bool isGuardianAction);

  /// @dev Limited fields included. Details can be retrieved from Starkware logs if needed.
  event RequestedForcedTrade(uint256 starkKey, uint256 vaultId, bool isGuardianAction);

  // ============ Constructor ============

  constructor(IStarkPerpetual starkPerpetual) {
    STARK_PERPETUAL = starkPerpetual;
  }

  // ============ External Functions ============

  /**
   * @notice Deposit funds to the exchange.
   *
   *  IMPORTANT: The caller is responsible for providing `quantizedAmount` in the right units.
   *             Currently, the exchange collateral is USDC, denominated in ERC20 token units, but
   *             this could change in the future.
   *
   * @param  starkKey         The STARK key of the account. Must be authorized by FUNDS_ADMIN_ROLE.
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
  ) external nonReentrant onlyRole(EXCHANGE_ROLE) onlyAllowedKey(starkKey) returns (uint256) {
    // Deposit and get the deposited token amount.
    uint256 startingBalance = getTokenBalance();
    STARK_PERPETUAL.deposit(starkKey, assetType, vaultId, quantizedAmount);
    uint256 endingBalance = getTokenBalance();
    uint256 tokenAmount = startingBalance.sub(endingBalance);

    // Disallow depositing borrowed funds to the exchange if the guardian has restricted borrowing.
    if (_IS_BORROWING_RESTRICTED_) {
      require(
        endingBalance >= getBorrowedAndDebtBalance(),
        'SP1Borrowing: Cannot deposit borrowed funds to the exchange while borrowing is restricted'
      );
    }

    emit DepositedToExchange(starkKey, assetType, vaultId, tokenAmount);
    return tokenAmount;
  }

  /**
   * @notice Trigger a withdrawal of account funds held in the exchange contract. This can be
   *  called after a (slow) withdrawal has already been processed by the L2 exchange.
   *
   * @param  starkKey   The STARK key of the account. Must be authorized by FUNDS_ADMIN_ROLE.
   * @param  assetType  The exchange asset ID for the asset to withdraw.
   *
   * @return The ERC20 token amount received by this contract.
   */
  function withdrawFromExchange(uint256 starkKey, uint256 assetType)
    external
    nonReentrant
    onlyRole(EXCHANGE_ROLE)
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
  ) internal returns (uint256) {
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
  ) internal {
    STARK_PERPETUAL.forcedWithdrawalRequest(starkKey, vaultId, quantizedAmount, premiumCost);
    emit RequestedForcedWithdrawal(starkKey, vaultId, isGuardianAction);
  }

  function _forcedTradeRequest(
    uint256[12] calldata args,
    bytes calldata signature,
    bool isGuardianAction
  ) internal {
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

  // ============ Private Functions ============

  /**
   * @dev Forced trade with premiumCost = true.
   *
   *  Split into separate functions in order to avoid `CompilerError: Stack too deep`.
   *
   */
  function _forcedTradeRequestPremiumCostTrue(uint256[12] calldata args, bytes calldata signature)
    private
  {
    STARK_PERPETUAL.forcedTradeRequest(
      args[0], // starkKeyA
      args[1], // starkKeyB
      args[2], // vaultIdA
      args[3], // vaultIdB
      args[4], // collateralAssetId
      args[5], // syntheticAssetId
      args[6], // amountCollateral
      args[7], // amountSynthetic
      args[8] != 0, // aIsBuyingSynthetic
      args[9], // submissionExpirationTime
      args[10], // nonce
      signature,
      true // premiumCost
    );
  }

  /**
   * @dev Forced trade with premiumCost = false.
   *
   *  Split into separate functions in order to avoid `CompilerError: Stack too deep`.
   *
   */
  function _forcedTradeRequestPremiumCostFalse(uint256[12] calldata args, bytes calldata signature)
    private
  {
    STARK_PERPETUAL.forcedTradeRequest(
      args[0], // starkKeyA
      args[1], // starkKeyB
      args[2], // vaultIdA
      args[3], // vaultIdB
      args[4], // collateralAssetId
      args[5], // syntheticAssetId
      args[6], // amountCollateral
      args[7], // amountSynthetic
      args[8] != 0, // aIsBuyingSynthetic
      args[9], // submissionExpirationTime
      args[10], // nonce
      signature,
      false // premiumCost
    );
  }
}
