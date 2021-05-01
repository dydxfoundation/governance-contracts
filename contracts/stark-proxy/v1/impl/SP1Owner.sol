pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {SafeERC20} from '../../../lib/SafeERC20.sol';
import {IStarkPerpetual} from '../../../interfaces/IStarkPerpetual.sol';
import {SP1Borrowing} from './SP1Borrowing.sol';
import {SP1Exchange} from './SP1Exchange.sol';

/**
 * @title SP1Owner
 * @author dYdX
 *
 * @notice Actions which may be called only by OWNER_ROLE. These include actions involving a high
 *  degree of risk with respect to funds held by the contract.
 */
abstract contract SP1Owner is SP1Borrowing, SP1Exchange {
  using SafeERC20 for IERC20;

  // ============ Events ============

  event UpdatedStarkKey(uint256 starkKey, bool isAllowed);

  event UpdatedRecipient(address recipient, bool isAllowed);

  // ============ External Functions ============

  /**
   * @notice Allow exchange functions to be called for a particular STARK key.
   *
   * @param  starkKey  The STARK key to allow.
   */
  function allowStarkKey(uint256 starkKey) external nonReentrant onlyRole(OWNER_ROLE) {
    require(!_ALLOWED_STARK_KEYS_[starkKey], 'SP1Owner: STARK key already allowed');
    _ALLOWED_STARK_KEYS_[starkKey] = true;
    emit UpdatedStarkKey(starkKey, true);
  }

  /**
   * @notice Remove a STARK key from the allowed list.
   *
   * @param  starkKey  The STARK key to disallow.
   */
  function disallowStarkKey(uint256 starkKey) external nonReentrant onlyRole(OWNER_ROLE) {
    require(_ALLOWED_STARK_KEYS_[starkKey], 'SP1Owner: STARK key already disallowed');
    _ALLOWED_STARK_KEYS_[starkKey] = false;
    emit UpdatedStarkKey(starkKey, false);
  }

  /**
   * @notice Allow withdrawals of excess funds to be made to a particular recipient.
   *
   * @param  recipient  The recipient to allow.
   */
  function allowRecipient(address recipient) external nonReentrant onlyRole(OWNER_ROLE) {
    require(!_ALLOWED_RECIPIENTS_[recipient], 'SP1Owner: Recipient already allowed');
    _ALLOWED_RECIPIENTS_[recipient] = true;
    emit UpdatedRecipient(recipient, true);
  }

  /**
   * @notice Remove a recipient from the allowed list.
   *
   * @param  recipient  The recipient to disallow.
   */
  function disallowRecipient(address recipient) external nonReentrant onlyRole(OWNER_ROLE) {
    require(_ALLOWED_RECIPIENTS_[recipient], 'SP1Owner: Recipient already disallowed');
    _ALLOWED_RECIPIENTS_[recipient] = false;
    emit UpdatedRecipient(recipient, false);
  }

  /**
   * @notice Set ERC20 token allowance for the exchange contract.
   *
   * @param  token   The ERC20 token to set the allowance for.
   * @param  amount  The new allowance amount.
   */
  function setExchangeContractAllowance(address token, uint256 amount)
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
  function setStakingContractAllowance(address token, uint256 amount)
    external
    nonReentrant
    onlyRole(OWNER_ROLE)
  {
    // SafeERC20 safeApprove requires setting to zero first.
    IERC20(token).safeApprove(address(LIQUIDITY_STAKING), 0);
    IERC20(token).safeApprove(address(LIQUIDITY_STAKING), amount);
  }
}
