pragma solidity 0.7.5;
pragma experimental ABIEncoderV2;

import {IERC20} from '../../../interfaces/IERC20.sol';
import {SafeERC20} from '../../../lib/SafeERC20.sol';
import {SafeMath} from '../../../lib/SafeMath.sol';
import {IStarkPerpetual} from '../../../interfaces/IStarkPerpetual.sol';
import {SP1Exchange} from './SP1Exchange.sol';

/**
 * @title SP1FundsAdmin
 * @author dYdX
 *
 * @notice Actions which may be called only by FUNDS_ADMIN_ROLE. These include withdrawing funds to
 *  external addresses, and other actions that directly affect the financial risk of funds held by
 *  the contract.
 */
abstract contract SP1FundsAdmin is SP1Exchange {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ============ Events ============

  event WithdrewExcessToken(address recipient, uint256 amount);

  event WithdrewExcessOtherToken(address token, address recipient, uint256 amount);

  event WithdrewExcessEther(address recipient, uint256 amount);

  // ============ External Functions ============

  /**
   * @notice Withdraw a token amount in excess of the borrowed balance.
   *
   *  The contract may hold an excess balance if, for example, additional funds were added by the
   *  contract owner for use with the same exchange account, or if profits were earned from
   *  activity on the exchange.
   *
   * @param  recipient  The recipient to receive tokens. Must be authorized by OWNER_ROLE.
   */
  function withdrawExcessToken(address recipient, uint256 amount)
    external
    nonReentrant
    onlyRole(FUNDS_ADMIN_ROLE)
    onlyAllowedRecipient(recipient)
  {
    uint256 owedBalance = getBorrowedAndDebtBalance();
    uint256 tokenBalance = getTokenBalance();
    uint256 availableBalance = tokenBalance.sub(owedBalance);
    require(amount <= availableBalance, 'SP1FundsAdmin: Amount exceeds withdrawable balance');
    TOKEN.safeTransfer(recipient, amount);
    emit WithdrewExcessToken(recipient, amount);
  }

  /**
   * @notice Withdraw any ERC20 token balance other than the token used for borrowing.
   *
   *  Note: The contract is not expected to hold other tokens so this is not normally needed.
   *
   * @param  recipient  The recipient to receive tokens. Must be authorized by OWNER_ROLE.
   */
  function withdrawExcessOtherToken(
    address token,
    address recipient,
    uint256 amount
  ) external nonReentrant onlyRole(FUNDS_ADMIN_ROLE) onlyAllowedRecipient(recipient) {
    require(
      token != address(TOKEN),
      'SP1FundsAdmin: Cannot use this function to withdraw borrowed token'
    );
    IERC20(token).safeTransfer(recipient, amount);
    emit WithdrewExcessOtherToken(token, recipient, amount);
  }

  /**
   * @notice Withdraw any ether.
   *
   *  Note: The contract is not expected to hold Ether so this is not normally needed.
   *
   * @param  recipient  The recipient to receive Ether. Must be authorized by OWNER_ROLE.
   */
  function withdrawExcessEther(address recipient, uint256 amount)
    external
    nonReentrant
    onlyRole(FUNDS_ADMIN_ROLE)
    onlyAllowedRecipient(recipient)
  {
    payable(recipient).transfer(amount);
    emit WithdrewExcessEther(recipient, amount);
  }

  /**
   * @notice Make a forced withdrawal request to withdraw collateral from the exchange.
   *
   * @param  starkKey         The STARK key of the account. Must be authorized by FUNDS_ADMIN_ROLE.
   * @param  vaultId          The exchange position ID of the account.
   * @param  quantizedAmount  The withdrawal amount denominated in the exchange base units.
   * @param  premiumCost      Whether to pay extra gas for the right to bypass the regular
   *                          per-block limit.
   */
  function forcedWithdrawalRequest(
    uint256 starkKey,
    uint256 vaultId,
    uint256 quantizedAmount,
    bool premiumCost
  ) external nonReentrant onlyRole(FUNDS_ADMIN_ROLE) onlyAllowedKey(starkKey) {
    _forcedWithdrawalRequest(
      starkKey,
      vaultId,
      quantizedAmount,
      premiumCost,
      false // isGuardianAction
    );
  }

  /**
   * @notice Make a forced trade request to reduce the size of a position on the exchange.
   *
   * @param  args       Parameters to be passed to the StarkPerpetual forcedTradeRequest() function.
   * @param  signature  The signature for the counterparty to the trade.
   */
  function forcedTradeRequest(uint256[12] calldata args, bytes calldata signature)
    external
    nonReentrant
    onlyRole(FUNDS_ADMIN_ROLE)
    onlyAllowedKey(args[0]) // starkKeyA
  {
    _forcedTradeRequest(args, signature, false);
  }
}
