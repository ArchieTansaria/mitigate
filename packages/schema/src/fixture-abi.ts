import { parseAbi } from "viem";
// The PB-07 artificial test application must implement these interfaces.
// These are not claims about the ABI of Bonzo, Supra or arbitrary production contracts.
export const priceSourceAbi = parseAbi([
  "function latestPrice() view returns (uint256 price, uint256 updatedAt)",
]);
export const adapterAbi = parseAbi([
  "function priceSource() view returns (address)",
  "function maxAge() view returns (uint256)",
  "function priceDecimals() view returns (uint8)",
  "function latestPrice() view returns (uint256 price, uint256 updatedAt)",
]);
export const marketAbi = parseAbi([
  "function adapter() view returns (address)",
  "function quoteCollateral(uint256 amount) view returns (uint256 value)",
]);
