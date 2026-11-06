# Runtime networks (PB-04)

`runtime.testnet.json` contains public chain identities and the verified Arc ERC-20 USDC interface. It deliberately has no campaign addresses: B adds real deployment outputs after PB-15–20. The optional `deployments` object requires both campaign and source-registry addresses, their deployed code hashes and deployment transaction hashes. Never invent these values. Configuration validation does not prove those contracts are correct.

`runtime.local.example.json` is a clearly labelled local-only fixture: two Anvil chains (31337/31338), dummy selectors and token address. It cannot load under `PATCHBOND_MODE=testnet`. No live CCIP route is claimed for it.

Environment variables hold RPC URLs, database credentials and artifact settings. `loadConfig` validates required values and exposes only non-secret status metadata. The API startup separately checks both RPC chain IDs, plus actual token decimals in testnet mode. Supported testnet identity constants are intentional protocol configuration, not address-specific verdict logic. Financial deployment addresses remain absent until generated.

Local artifacts require local mode and an absolute managed directory. Testnet mode requires an S3 bucket/region (optional HTTPS S3-compatible endpoint). AWS credentials use the normal SDK environment/role provider; never copy them into manifests. Public manifests and error messages must contain no authenticated endpoint URLs.
