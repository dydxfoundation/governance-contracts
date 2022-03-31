// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.7.5;
pragma abicoder v2;

import { SafeERC20 } from '../../../dependencies/open-zeppelin/SafeERC20.sol';
import { SafeMath } from '../../../dependencies/open-zeppelin/SafeMath.sol';
import { IERC20 } from '../../../interfaces/IERC20.sol';
import { IStarkPerpetual } from '../../../interfaces/IStarkPerpetual.sol';
import { SP1Borrowing } from '../../v1/impl/SP1Borrowing.sol';
import { SP2Exchange } from '../../v2/impl/SP2Exchange.sol';
import { IGovernancePowerDelegationERC20 } from '../../../interfaces/IGovernancePowerDelegationERC20.sol';

/**
 * @title SP3Owner
 * @author dYdX
 *
 * @dev Actions which may be called only by OWNER_ROLE. These include actions with a larger amount
 *  of control over the funds held by the contract.
 */
abstract contract SP3Owner is
  SP1Borrowing,
  SP2Exchange
{
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Constants ============

  /// @notice Time that must elapse before a queued forced trade request can be submitted.
  uint256 public constant FORCED_TRADE_WAITING_PERIOD = 7 days;

  /// @notice Max time that may elapse after the waiting period before a queued forced trade
  ///  request expires.
  uint256 public constant FORCED_TRADE_GRACE_PERIOD = 7 days;

  /// @notice Address of the DYDX Token Smart Contract.
  address public constant DYDX_ADDRESS = 0x92D6C1e31e14520e676a687F0a93788B716BEff5;

  /// @notice Address of the Staked DYDX Token Smart Contract.
  address public constant STAKED_DYDX_ADDRESS = 0x65f7BA4Ec257AF7c55fd5854E5f6356bBd0fb8EC;

  // ============ Events ============

  event UpdatedStarkKey(
    uint256 starkKey,
    bool isAllowed
  );

  event UpdatedExternalRecipient(
    address recipient,
    bool isAllowed
  );

  event QueuedForcedTradeRequest(
    uint256[12] args,
    bytes32 argsHash
  );

  // ============ External Functions ============

  /**
   * @notice Allow exchange functions to be called for a particular STARK key.
   *
   *  Will revert if the STARK key is not registered to this contract's address on the
   *  StarkPerpetual contract.
   *
   * @param  starkKey  The STARK key to allow.
   */
  function allowStarkKey(
    uint256 starkKey
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    // This will revert with 'USER_UNREGISTERED' if the STARK key was not registered.
    address ethKey = STARK_PERPETUAL.getEthKey(starkKey);

    // Require the STARK key to be registered to this contract before we allow it to be used.
    require(ethKey == address(this), 'SP3Owner: STARK key not registered to this contract');

    require(!_ALLOWED_STARK_KEYS_[starkKey], 'SP3Owner: STARK key already allowed');
    _ALLOWED_STARK_KEYS_[starkKey] = true;
    emit UpdatedStarkKey(starkKey, true);
  }

  /**
   * @notice Remove a STARK key from the allowed list.
   *
   * @param  starkKey  The STARK key to disallow.
   */
  function disallowStarkKey(
    uint256 starkKey
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    require(_ALLOWED_STARK_KEYS_[starkKey], 'SP3Owner: STARK key already disallowed');
    _ALLOWED_STARK_KEYS_[starkKey] = false;
    emit UpdatedStarkKey(starkKey, false);
  }

  /**
   * @notice Allow withdrawals of excess funds to be made to a particular recipient.
   *
   * @param  recipient  The recipient to allow.
   */
  function allowExternalRecipient(
    address recipient
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    require(!_ALLOWED_RECIPIENTS_[recipient], 'SP3Owner: Recipient already allowed');
    _ALLOWED_RECIPIENTS_[recipient] = true;
    emit UpdatedExternalRecipient(recipient, true);
  }

  /**
   * @notice Remove a recipient from the allowed list.
   *
   * @param  recipient  The recipient to disallow.
   */
  function disallowExternalRecipient(
    address recipient
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    require(_ALLOWED_RECIPIENTS_[recipient], 'SP3Owner: Recipient already disallowed');
    _ALLOWED_RECIPIENTS_[recipient] = false;
    emit UpdatedExternalRecipient(recipient, false);
  }

  /**
   * @notice Set ERC20 token allowance for the exchange contract.
   *
   * @param  token   The ERC20 token to set the allowance for.
   * @param  amount  The new allowance amount.
   */
  function setExchangeContractAllowance(
    address token,
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    // SafeERC20 safeApprove requires setting to zero first.
    IERC20(token).safeApprove(address(STARK_PERPETUAL), 0);
    IERC20(token).safeApprove(address(STARK_PERPETUAL), amount);
  }

  /**
   * @notice Set ERC20 token allowance for the staking contract.
   *
   * @param  token   The ERC20 token to set the allowance for.
   * @param  amount  The new allowance amount.
   */
  function setStakingContractAllowance(
    address token,
    uint256 amount
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    // SafeERC20 safeApprove requires setting to zero first.
    IERC20(token).safeApprove(address(LIQUIDITY_STAKING), 0);
    IERC20(token).safeApprove(address(LIQUIDITY_STAKING), amount);
  }

  /**
   * @notice Request a forced withdrawal from the exchange.
   *
   * @param  starkKey         The STARK key of the account. Must be authorized by OWNER_ROLE.
   * @param  vaultId          The exchange position ID for the account to deposit to.
   * @param  quantizedAmount  The withdrawal amount denominated in the exchange base units.
   * @param  premiumCost      Whether to pay a higher fee for faster inclusion in certain scenarios.
   */
  function forcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
    onlyAllowedKey(starkKey)
  {
    _forcedWithdrawalRequest(starkKey, vaultId, quantizedAmount, premiumCost, false);
  }

  /**
   * @notice Queue a forced trade request to be submitted after the waiting period.
   *
   * @param  args  Arguments for the forced trade request.
   */
  function queueForcedTradeRequest(
    uint256[12] calldata args
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    bytes32 argsHash = keccak256(abi.encodePacked(args));
    _QUEUED_FORCED_TRADE_TIMESTAMPS_[argsHash] = block.timestamp;
    emit QueuedForcedTradeRequest(args, argsHash);
  }

  /**
   * @notice Submit a forced trade request that was previously queued.
   *
   * @param  args       Arguments for the forced trade request.
   * @param  signature  The signature of the counterparty to the trade.
   */
  function forcedTradeRequest(
    uint256[12] calldata args,
    bytes calldata signature
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
    onlyAllowedKey(args[0]) // starkKeyA
  {
    bytes32 argsHash = keccak256(abi.encodePacked(args));
    uint256 timestamp = _QUEUED_FORCED_TRADE_TIMESTAMPS_[argsHash];
    require(
      timestamp != 0,
      'SP3Owner: Forced trade not queued or was vetoed'
    );
    uint256 elapsed = block.timestamp.sub(timestamp);
    require(
      elapsed >= FORCED_TRADE_WAITING_PERIOD,
      'SP3Owner: Waiting period has not elapsed for forced trade'
    );
    require(
      elapsed <= FORCED_TRADE_WAITING_PERIOD.add(FORCED_TRADE_GRACE_PERIOD),
      'SP3Owner: Grace period has elapsed for forced trade'
    );
    _QUEUED_FORCED_TRADE_TIMESTAMPS_[argsHash] = 0;
    _forcedTradeRequest(args, signature, false);
  }

  /**
   * @notice Request to cancel a pending deposit to the exchange.
   *
   * @param  starkKey   The STARK key of the account. Must be authorized by OWNER_ROLE.
   * @param  assetType  The exchange asset ID for the deposit.
   * @param  vaultId    The exchange position ID for the deposit.
   */
  function depositCancel(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
    onlyAllowedKey(starkKey)
  {
    _depositCancel(starkKey, assetType, vaultId, false);
  }

  /**
   * @notice Reclaim a canceled pending deposit to the exchange. Requires that `depositCancel`
   *  was previously called.
   *
   * @param  starkKey   The STARK key of the account. Must be authorized by OWNER_ROLE.
   * @param  assetType  The exchange asset ID for the deposit.
   * @param  vaultId    The exchange position ID for the deposit.
   */
  function depositReclaim(
    uint256 starkKey,
    uint256 assetType,
    uint256 vaultId
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
    onlyAllowedKey(starkKey)
  {
    _depositReclaim(starkKey, assetType, vaultId, false);
  }

  /**
   * @notice Delegates governance power of DYDX or stakedDYDX to a delegatee.
   *
   * @param  token     The address of the token to delegate. Must be DYDX_ADDRESS or STAKED_DYDX_ADDRESS.
   * @param  delegatee The address to delegate to.
   */
  function delegate(
    address token,
    address delegatee
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    require(
      token == DYDX_ADDRESS ||
      token == STAKED_DYDX_ADDRESS,
      'tokenAddress is not DYDX or stakedDYDX'
    );
    IGovernancePowerDelegationERC20(token).delegate(delegatee);
  }

  /**
   * @notice Delegates a specific governance power of DYDX or stakedDYDX to a delegatee.
   *
   * @param  token           The address of the token to delegate. Must be DYDX_ADDRESS or STAKED_DYDX_ADDRESS.
   * @param  delegatee       The address to delegate to.
   * @param  delegationType  The type of delegation (VOTING_POWER, PROPOSITION_POWER).
   */
  function delegateByType(
    address token,
    address delegatee,
    IGovernancePowerDelegationERC20.DelegationType delegationType
  )
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    require(
      token == DYDX_ADDRESS ||
      token == STAKED_DYDX_ADDRESS,
      'tokenAddress is not DYDX or stakedDYDX'
    );
    IGovernancePowerDelegationERC20(token).delegateByType(delegatee, delegationType);
  }
}
