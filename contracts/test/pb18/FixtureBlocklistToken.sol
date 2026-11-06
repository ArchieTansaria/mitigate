// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TEST-ONLY fixture: a six-decimal token whose transfers to or from a blocked account revert, standing in
/// for a blocklisting stablecoin so PB-18 can prove a failed recipient payout rolls back cleanly and is retryable.
/// It is not a real token and its address is never configuration.
contract FixtureBlocklistToken is ERC20 {
    error Blocked(address account);

    mapping(address => bool) public blocked;

    constructor() ERC20("FIXTURE blocklist token (6 decimals)", "fBLK") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (blocked[from]) revert Blocked(from);
        if (blocked[to]) revert Blocked(to);
        super._update(from, to, value);
    }
}
