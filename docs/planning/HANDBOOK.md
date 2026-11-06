# PatchBond Project Handbook

**Version 1.0 • 6 November 2026 • Design baseline for implementation**

PatchBond helps a customer and a software maintainer answer a precise question: **Has the agreed repair actually reached the customer's registered deployments, and does the resulting application pass the agreed checks?**

The proposed platform follows the relevant application and dependency paths, runs reproducible tests, explains unfinished work and records acceptance evidence. An optional funded maintenance agreement uses that evidence to govern USDC payment and a performance bond.

This handbook explains the project from first principles and then describes its proposed implementation. It is product and engineering documentation, not a prompt that automatically authorizes an agent to deploy contracts, move money or contact anyone.

**Current status:** the design and public documentation have been reviewed. The application, contracts, test runner, sponsor integrations and deployment pipeline have not yet been implemented or validated together. Statements about what PatchBond “does” below describe the intended behaviour, unless explicitly identified as an existing third-party capability.

## How to read this handbook

A teammate new to Web3 should read sections 1–7 first, then follow the worked example in section 8. Engineers should then read the architecture, data contracts, security rules, financial state machine and build sequence. The glossary provides short definitions for reference.

The implementation baseline is a reusable verification pipeline for one supported application and proxy arrangement, with configurable deployment lists. The number of deployments is not hardcoded. The demo uses a small fleet because that makes different failure modes easy to understand.

The first financial implementation covers one maintenance milestone, a fee, an optional agreed bond, a challenge period and finite dispute resolution. Continuous warranties, staged payouts and automatic application reopening are outside this baseline.

# 1 The problem we are solving

A supplier can publish corrected smart-contract code without completing a customer's repair.

A customer application may still call an old dependency. A proxy may have been upgraded but initialized incorrectly. An adapter may still select an obsolete feed. A code change may prevent malicious input while also breaking legitimate user operations. Different deployments may have different owners and therefore need different people to act.

The difficult operational question is not simply “Does a fixed version exist?” It is:

> Which of our registered applications still needs work, what exactly remains, who has authority to do it, and what evidence establishes that the agreed work is complete?

Today, a team can answer parts of that question using deployment scripts, transaction simulators, monitoring systems, tests, issue trackers and chat. PatchBond organizes those parts around a specific repair and a shared acceptance process.

## The most promising initial users

The strongest initial user is a contract supplier, deployment platform or maintenance company supporting deployments administered by multiple customers. Its engineering or support team needs an installed-base view: which customers are affected, which actions remain and which repairs have been accepted.

Customer engineering teams use the same system to understand their exposure and review the evidence. Authorized wallet owners or governance participants execute the required changes. An agreed evaluator performs the technical checks.

A single team with a few contracts, good fork tests and mature CI may reasonably prefer its existing scripts. PatchBond becomes more useful when repeated investigation and coordination cross organizational boundaries.

## Evidence that the workflow exists

During its December 2023 incident response, thirdweb built a mitigation tool and reported helping mitigate over 8,000 contracts across 43 chains. Actions varied by deployment, including locking, snapshotting and migration. Publishing repaired contracts did not finish the response. The existing mitigation tool is also a substitute: this example validates the operational problem, not a claim that PatchBond invented it. [Thirdweb incident report](https://blog.thirdweb.com/security-vulnerability/)

OpenZeppelin's associated disclosure describes different actions according to each instance, including disabling a forwarder, pausing, removing approvals, upgrading or considering migration. That supports tracking deployment-specific prerequisites. Our initial oracle-adapter implementation would not automatically support every pattern in that incident. [OpenZeppelin disclosure](https://www.openzeppelin.com/news/arbitrary-address-spoofing-vulnerability-erc2771context-multicall-public-disclosure)

The business hypothesis remains unvalidated: teams may value a shared acceptance workflow, but we have not established that suppliers will post bonds or that customers will buy this product.

# 2 The product in plain language

PatchBond is a repair-acceptance platform.

A supplier publishes a repair definition. A customer identifies the deployments it wants checked. The parties agree on what completion means. PatchBond inspects those deployments, runs the agreed tests, identifies missing work and produces evidence tied to the actual observed state.

When a maintenance agreement is funded, qualifying evidence can begin a payment-release process. A failed test does not automatically confiscate a bond.

The product has three related layers:

| Layer | Question it answers | Main output |
| --- | --- | --- |
| Verification | Does this registered deployment satisfy the agreed checks? | Results and reproducible evidence |
| Coordination | What remains, and who controls the next action? | Deployment-specific tasks and transaction proposals |
| Funded acceptance | Has the agreed payment condition been met or disputed? | Escrow state and permitted withdrawals |

Verification must be useful without escrow. The financial layer cannot rescue an otherwise unnecessary monitoring dashboard.

## A short explanation for teammates

“A supplier saying a fix is ready does not mean every customer has successfully adopted it. PatchBond checks the real application path, tests the agreed behaviour, identifies missing actions and records completion evidence. If the parties have funded a maintenance agreement, that evidence also controls its settlement.”

## What the first version does not claim

PatchBond does not discover every vulnerability, write the repair autonomously, understand arbitrary contract systems or prove that an application is universally secure. It does not know about unregistered deployments. It does not possess customers' upgrade keys. It does not prevent an unknown exploit merely by being installed.

A report means that specified checks passed or failed under recorded conditions. Its meaning must remain narrower than “this application is safe.”

# 3 Web3 foundations needed to understand the project

## Blockchain and Ethereum

A blockchain maintains an ordered record of transactions and resulting state. Ethereum supports smart contracts: programs executed according to the network's rules.

**State** means stored information, such as account balances, contract settings, ownership and records of accepted agreements. A **transaction** is a request that can change state. It is authorized according to the relevant account and contract rules and generally costs a network fee called gas.

A **block** groups transactions and identifies a point in chain history. A block number describes its position; a block hash identifies the particular block. A chain can temporarily reorganize recent history, so important decisions need an explicit finality policy rather than assuming the newest block is permanent.

## Smart contracts and deployments

A smart contract has executable code at an address and may hold persistent state. **Deploying** means creating a contract instance on a chain. The same source code can have many deployments, each with its own address and state.

An address alone is insufficient to identify a deployment across networks. PatchBond uses the chain identifier together with the address. Ethereum mainnet, Ethereum Sepolia and Arc Testnet are separate networks.

A **mainnet** is a network used for real applications and assets. A **testnet** is used for development. Testnet tokens are not production funds, and a successful testnet demo does not establish production readiness.

## Tokens units and approvals

A token balance is normally stored as an integer. **Decimals** tell software how many of its smallest units make one displayed token. With six decimals, 1 USDC is represented as 1,000,000 units; 1,000 USDC is 1,000,000,000 units. An incorrect decimal conversion can turn a correct price into a dangerously wrong application value.

An ERC-20 **allowance** permits a specified spender to transfer up to a specified token amount from the approving account. Approving PatchBond's policy and granting the vault a token allowance are different actions. The first accepts terms; the second authorizes a transfer. Funding then moves the tokens into the agreement. The interface must explain these separately and should request only the allowance needed for the intended deposit.

Arc's USDC ERC-20 interface uses six decimals while its native gas representation uses eighteen. The vault should use the ERC-20 interface consistently for its agreement accounting. [Arc USDC reference](https://docs.arc.io/arc/references/contract-addresses)

## Wallets and authority

A private key can authorize actions for its account. A **multisig**, such as a Safe, is a contract wallet whose rules can require multiple approvals. A governance system may require proposals, votes and a waiting period before executing a change.

A contract's access rules decide who may perform an upgrade or change a setting. The company that wrote the source code does not necessarily control every deployed copy.

## Dependencies and oracles

A **dependency** is another component an application relies on. A lending application might depend on a price adapter, which relies on an oracle contract.

An **oracle** makes information available to a blockchain application. A price oracle can supply asset prices. An **adapter** translates or selects information so the application can use it, for example by selecting a feed or converting decimal units.

PatchBond also has an offchain **inspection module**: software that knows which calls and observations are needed to inspect a supported application. It is not the oracle adapter contract and is not inserted into the application's transaction path. This handbook uses “oracle adapter” for the deployed component and “inspection module” for PatchBond's reader.

A **verifier** checks whether supplied data or a proof meets a defined rule. In an oracle system, this could include checking signatures. PatchBond's test runner is a different kind of verifier: it evaluates an agreed repair. The two meanings must not be confused.

## Proxies and implementations

Many contracts are not directly editable after deployment. An upgradeable system can put a **proxy** at a stable address and have it execute code from a separate **implementation** address.

A useful analogy is a stable service desk that changes the instruction manual it follows. The proxy address stays the same; the implementation supplies the logic. In common proxy patterns, the application's persistent state stays with the proxy.

The EVM operation called **delegatecall** executes another contract's code in the caller's storage context. This is why changing an implementation requires care: new code must interpret existing storage correctly.

~~~mermaid
flowchart LR
    A[Application] --> P[Stable proxy address]
    P --> V1[Old implementation]
    P -. Authorized upgrade changes target .-> V2[Approved implementation]
~~~

ERC-1967 standardizes locations for certain proxy information, including implementation and admin slots. It helps tools inspect recognized proxies. Finding a plausible address in one slot does not prove that arbitrary code behaves like a standard proxy. [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967)

An **initializer** sets the initial state of a proxy-based application. A **storage layout** describes how variables occupy storage. A careless upgrade can reinterpret old data incorrectly. OpenZeppelin provides established deployment and upgrade checks; PatchBond should incorporate them where the required artifacts are available. [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades-plugins)

## Hashes and signatures

A **hash** is a compact fingerprint of bytes. If the bytes change, their cryptographic hash is expected to change. A code hash helps identify exact code; it does not say that the code is safe.

A **digital signature** authenticates an assertion by a particular signing key. It does not make the assertion true. A signed test report proves who signed it, not that the tests were honestly executed.

These distinctions explain why PatchBond needs behavioural tests, an explicit evaluator trust model and a challenge process in addition to hashes.

# 4 Repairs and responsibilities

A repair can involve corrected code, a configuration change, initialization, migration or several coordinated actions. The supplier or developers create the fix. PatchBond helps determine whether the agreed repair has been adopted correctly.

| Role | Responsibility | Authority it does not automatically receive |
| --- | --- | --- |
| Customer | Chooses its covered deployments and agrees to acceptance terms | Control of supplier-owned contracts |
| Supplier | Publishes a component or repair | Control of all customer deployments |
| Maintainer | Promises to carry out specified repair actions | Authority over contracts it does not administer |
| Authorized executor | Executes permitted onchain changes | Authority to rewrite the maintenance agreement |
| Evaluator | Runs the approved checks and signs results | Freedom to change payment recipients or amounts |
| Arbiter | Resolves a defined financial dispute | Broad access to customer application assets |
| PatchBond operator | Runs the interface, API and job infrastructure | Customer upgrade keys or an unrestricted escrow withdrawal key |

The supplier and maintainer can be the same organization. For the first funded demo, use one maintainer as the supplier-side counterparty and bond depositor. If those roles later differ, each party whose obligations or funds are affected needs explicit consent.

## Observe explain prepare execute verify

**Observe:** inspect the registered application and its supported dependency path.

**Explain:** compare observations with the accepted requirements, identify an unmet condition and identify the relevant authorized party. If ownership cannot be reliably determined, report that uncertainty.

**Prepare:** optionally construct a proposed transaction and simulate its effects. The proposal is addressed to the account or governance system that can perform the required operation.

**Execute:** the existing authorized party reviews and submits the transaction.

**Verify:** inspect the actual post-execution state and rerun the agreed checks.

A successful transaction receipt only establishes that execution did not fail in the recorded way. It does not establish that the intended repair is complete.

## Who receives a transaction proposal

If a supplier controls the oracle proxy, the supplier's authorized account receives the upgrade proposal. If the customer controls the application's oracle selection, the customer receives the configuration proposal. If the customer owns a copy of supplier code, the customer executes its upgrade.

A repair can require a supplier action followed by a customer action. The task view should preserve that order rather than blaming one party for every incomplete condition.

# 5 Permissions and enforcement

## Reading is different from changing

Public onchain code, events and accessible state can generally be inspected without permission from either company, subject to RPC access. Reading private repositories, internal manifests or private APIs requires authorization from their owner.

Sending a notification into Slack, email or a webhook requires the team to configure or authorize that channel. Being able to read a public contract does not authorize messaging its owner through an unrelated private service.

Preparing transaction data or running a private simulation does not authorize execution on the live chain.

| Operation | Required authority |
| --- | --- |
| Read public deployment information | RPC access; no application-admin role |
| Read private project information | Permission from the information owner |
| Notify a configured team destination | Authorization for that notification channel |
| Simulate against a private fork | Access to the necessary chain data |
| Prepare transaction data | No live upgrade role merely to prepare |
| Execute an upgrade or configuration change | The target contract's required authority |
| Fund an agreement | Each depositor's authorization and acceptance |
| Resolve a disputed allocation | The authority fixed in the agreement |

## Operational enforcement

Operational enforcement controls application behaviour. For example, a deliberately integrated controller could prevent borrowing from reopening without fresh verification.

That capability requires explicit integration and permission. PatchBond cannot impose it on arbitrary contracts. Automatic reopening, pausing and unrestricted upgrades are excluded from the first version.

## Financial enforcement

Financial enforcement governs funds deposited into the maintenance vault. The vault can withhold or allocate those funds according to agreed conditions. It cannot compel someone to repair code or take unrelated wallet balances.

A performance bond is an agreed deposit securing a specified maintenance obligation. It is not the collateral that a borrower deposits to take a loan, and it is not assumed to be standard practice among oracle companies.

A failed test is evidence about a test result. It is not automatically proof of a supplier's fault or a right to slash its bond.

# 6 Scope and current decisions

The initial application family is an oracle-dependent application using a documented oracle adapter and a known OpenZeppelin transparent-proxy arrangement. The product accepts a configurable list of deployments in that family. Each initial verification scope covers one source chain; the hackathon source chain is Sepolia. Arc is the settlement chain, not an additional application fleet that we claim to inspect in this version.

A **supported pattern** means the inspection code understands the relevant getters, proxy mechanism, initialization requirements and authority rules. It does not mean a hardcoded address list.

| Included in the first implementation | Excluded from the first implementation |
| --- | --- |
| Deployment inventory and explicit coverage | Automatic discovery of every deployment |
| Supported dependency-path inspection | Universal analysis of arbitrary contract graphs |
| Repair-specific regression tests | General vulnerability discovery or a full audit |
| Preview and deployed-state verification modes | Paying for a preview as if it were deployed |
| Owner-specific tasks and transaction proposals | Holding customer upgrade keys |
| Reproducible evidence and historical acceptance | A universal claim of present safety |
| ENSv2 release-authority permissions | Cosmetic naming as the entire ENS integration |
| CRE report orchestration and CCIP delivery | Claiming API consensus proves fork execution |
| One funded milestone with bounded disputes | Continuous warranty and staged payment release |

Two or three demo deployments are presentation choices. Additional deployments should use the same data model, with explicit resource limits and batching. No unmeasured scale or throughput claim should appear in the product.

# 7 What makes PatchBond different

OpenZeppelin Upgrades already manages upgrade mechanics and compatibility checks. Tenderly already simulates application transactions and provides traces. OpenZeppelin Monitor and products such as Hypernative already monitor conditions and trigger responses. PatchBond should use or complement those capabilities.

Its proposed differentiator is a reusable repair campaign across customer deployments: one approved repair definition, customer-specific obligations, tests against actual application paths, an explanation of remaining work and evidence suitable for shared acceptance.

| Existing category | What it already solves | PatchBond's proposed addition |
| --- | --- | --- |
| Upgrade tools | Deploy and execute upgrades with established validation | Track whether the complete agreed customer repair was fulfilled |
| Simulation tools | Execute transactions against modeled chain state | Organize tests around a jointly accepted repair and deployment inventory |
| Monitoring tools | Detect changes and alert or respond | Track a specific repair's completion and responsible parties |
| CI and scripts | Run repeatable automated checks | Share acceptance meaning and evidence across organizations |
| Milestone escrow | Hold funds pending acceptance | Bind acceptance to a structured technical workflow |

References: [OpenZeppelin Monitor](https://docs.openzeppelin.com/monitor), [Tenderly simulations](https://docs.tenderly.co/simulations/overview), [Hypernative capabilities](https://www.hypernative.io/use-cases/smart-contract-protocol-security).

A script can perform many individual checks. PatchBond's value depends on making repeated coordination and acceptance easier than maintaining the equivalent collection of scripts and processes. Complexity is not a differentiator by itself.

Ethereum is useful because the deployments, permissions and acceptance records are onchain. Escrow adds shared execution of financial rules. The dashboard and test artifacts can remain offchain. The verification workflow could exist as a conventional service; the funded module is the clearest reason to put payment logic onchain.

# 8 A complete worked example

The organizations and amounts in this example are fictional. They explain the design and do not describe a deployed product.

**River** operates a lending application. **Signal** supplies and maintains an oracle component. River registers three deployments. River and Signal agree that the maintenance milestone is complete only when all required deployments are actually repaired and pass the specified application-level checks.

They choose an evaluator and a dispute resolver. River agrees to deposit 1,000 test USDC. Signal agrees to a 500 test USDC performance bond. These are illustrative values, not recommended commercial terms.

## A verification-only route

A user who wants diagnostics without escrow imports a deployment inventory, selects a repair pack and approves a verification specification. That specification defines the scope, tests and evaluator for this run. Reading public deployments does not require the supplier's consent. The output is a diagnostic report, not a jointly accepted maintenance completion.

This route uses a verificationScopeId and run ID. Financial fields are absent: there is no fee deposit, bond, arbiter, Arc agreement or CCIP settlement. No bilateral registry registration is required merely to run diagnostics. A published supplier release can still be discovered through ENS, but using it does not bind the supplier to a commercial obligation.

If the parties later want funded acceptance, they create and jointly approve a separate acceptance policy and execute a fresh qualifying run bound to it. An old diagnostic or preview report cannot simply be relabelled as a funded completion. The funded example below follows that second route.

## Step 1 Register the covered applications

River imports each chain and application address. The interface displays the recognized path from application to adapter to proxy to implementation. River confirms the intended inventory and sees unsupported or unresolved paths explicitly.

The coverage statement reads “3 registered deployments evaluated,” not “all River deployments are safe.”

## Step 2 Publish the repair definition

Signal's release operator publishes a candidate manifest. A manifest is a structured document describing a release. Its security approver authorizes the approved manifest through the configured ENSv2 permissions.

The manifest identifies the intended implementation, required settings and test pack. It does not prove the patch correct merely because an authorized account approved it.

## Step 3 Agree on customer-specific acceptance

River and Signal approve a policy that identifies the covered deployments, repair manifest, complete test suite, evaluator, payment amounts, bond conditions and deadlines.

One supplier release can support several customer policies. Each policy has its own scope and financial accounting. One customer's passing result must never settle another customer's agreement.

## Step 4 Initialize and fund the agreement

The Sepolia acceptance registry records both approvals. A CCIP message initializes the Arc agreement with those exact terms. River and Signal inspect the matching agreement and fund their respective deposits.

If only one party funds and the funding deadline passes, the depositor can recover its funds. A third party sending tokens does not silently create contractual obligations for someone else.

## Step 5 Run the first verification

The evaluator inspects a recorded chain snapshot and runs the full required suite.

| Deployment | Observed condition | Result |
| --- | --- | --- |
| River A | Correct implementation and settings; bad input rejected and valid use succeeds | Pass |
| River B | Application reaches an older dependency instance | Fail |
| River C | Approved implementation, but the adapter has the wrong decimal configuration | Fail |

The worker records the assertions, traces and relevant observed values. The report identifies the action owner for B and C. Nothing is paid merely because A passed.

## Step 6 Prepare and execute the missing work

If Signal controls the proxy behind B, PatchBond prepares that operation for Signal. If River controls C's adapter setting, it prepares the configuration operation for River.

The proposals display the chain, destination, function, arguments, value and simulated effects. The authorized parties inspect and execute them. The platform does not receive their private keys.

## Step 7 Verify the actual deployed result

After the changes are sufficiently finalized, the worker starts a new run from the actual chain state. It does not insert the desired implementation or configuration into the fork and call that a completed deployment.

All mandatory assertions pass. The result still means only that these checks passed under the recorded conditions.

## Step 8 Record qualifying acceptance

CRE retrieves the evidence, checks its binding to the policy and evaluator, and corroborates available chain facts. Its report reaches the authorized receiver on Sepolia.

The registry records a qualifying completion. The record includes the policy and report identity; it does not contain a general certificate that the application has no vulnerabilities.

## Step 9 Deliver the result and settle

A CCIP message carries the recorded completion to Arc. The vault verifies its origin and correspondence to the funded agreement.

If no valid challenge is filed before the agreed cutoff, anyone can trigger finalization. The fee becomes withdrawable by Signal and the bond returns to Signal. A dashboard button or scheduled caller can submit that transaction; time passing alone does not execute code.

## Step 10 Handle later changes separately

If River later changes an adapter setting, the current-status view becomes stale or requires rechecking when the change is detected. The historical acceptance record remains a statement about the earlier snapshot.

The first version does not offer a continuous security warranty. Later drift is not automatically grounds to claw back an already earned and withdrawn maintenance fee.

# 9 Architecture and component boundaries

~~~mermaid
flowchart TD
    E[ENSv2 approved repair manifest] --> P[Jointly approved acceptance policy]
    D[Registered applications and dependency routes] --> W[Isolated verification worker]
    P --> W
    W --> B[Signed evidence bundle and replay artifacts]
    B --> C[CRE checks evidence and available chain facts]
    E --> C
    P --> R[AcceptanceRegistry on Sepolia]
    C --> R
    R -->|CCIP policy and completion messages| V[MaintenanceVault on Arc]
    V --> M[Funding challenge settlement and recovery]
    B --> U[Web dashboard]
    R --> U
    V --> U
~~~

## Web application

The web application lets users import deployments, inspect dependency paths, approve policies, initiate verification, review proposals, fund agreements, challenge claims and withdraw permitted balances.

Use TypeScript with a familiar React-based interface and a standard Ethereum client library. Arc Studio must be the starting point for the Arc-targeted application. Keep the frontend thin: a green badge or enabled button is not an authorization rule.

## API and job coordination

The backend validates requests, stores offchain records, schedules verification jobs and serves evidence. A job is a durable record of work to perform.

Use PostgreSQL for inventories, jobs and indexed views, with a simple database-backed queue. A worker claims a job with a lease, records progress and makes retries safe. A lease prevents a crashed worker from blocking the job forever.

An idempotency key identifies the same requested operation across retries. For example, agreement ID, block hash, test-pack hash and mode can identify a particular verification request. Repeating a request must not create inconsistent financial events.

## Verification worker

The worker runs approved inspection logic and Foundry tests. It needs access to historical chain state, so the chosen RPC service must support the required block queries.

Use a fixed container image and pinned tool versions. A container is an isolated process environment; it is not automatically a complete security boundary. Restrict its resources, credentials, filesystem access and outbound network destinations.

Do not compile and execute arbitrary uploaded repositories as an unrestricted service. Begin with reviewed test packs shipped with the application. Supporting arbitrary customer test code later requires a stronger isolation and review design.

## Evidence storage

Store reports and replay artifacts offchain. Name artifacts by their digest or retain immutable versions so a URL cannot silently return different evidence for an existing claim.

A digest proves content identity, not availability. The system must retain artifacts through the challenge and arbitration deadlines and make them available to the parties and arbiter. A vanished artifact must be handled as missing evidence, not as a passing report.

The demo uses public fixtures and public evidence. Private customer code or sensitive traces need a separate access-control design before production use.

## Chainlink CRE

CRE coordinates external information and chain interactions. Its TypeScript code runs in a restricted WebAssembly environment, not a normal Node.js server. It should retrieve completed results rather than wait synchronously for a long fork job. [CRE runtime documentation](https://docs.chain.link/cre/concepts/typescript-wasm-runtime)

A run can therefore proceed asynchronously: the API starts the worker; the worker produces immutable artifacts; a later workflow execution retrieves and evaluates those artifacts.

## Source-chain acceptance registry

AcceptanceRegistry is the authoritative store for the approved policy and qualifying acceptance records. A database copy is only an indexed view.

The first source chain is Ethereum Sepolia. The customer's application fixtures and the ENSv2 integration also live there. The registry sends policy and completion messages to Arc.

## Arc maintenance vault

MaintenanceVault holds the designated USDC deposits and implements the financial state machine. It uses messages from the authorized source registry; it does not accept “paid” or “passed” flags supplied by the web UI.

Arc is a separate EVM-compatible L1, not an Ethereum rollup. The financial arrangement uses Arc because that is the selected settlement environment. If both acceptance and settlement belonged naturally on one chain, the additional cross-chain hop would be unnecessary.

## What remains outside the blockchain

Detailed traces, test output, job logs and UI indexes remain offchain. Only the commitments, acceptance records and financial state needed by the workflow belong onchain.

A **commitment** here is a recorded digest binding the system to particular bytes or terms. It allows later comparison without storing every byte in a contract.

# 10 Data contracts between components

A data contract defines what information one component must supply to another and what each field means. These are proposed schemas, not existing APIs. A **predicate** is a precise condition that evaluates to true or false, such as “the configured feed equals the agreed feed.” A **fingerprint** is a digest of selected relevant observations, rather than a claim that the entire application state is captured.

## Repair manifest

| Field group | Meaning |
| --- | --- |
| Release identity | Unique release ID and issue description |
| Supported patterns | Oracle-adapter and proxy families understood by the inspection module |
| Approved code | Expected implementation identity and matching rules |
| Configuration requirements | Explicit values or predicates that must hold |
| Test definition | Immutable test-pack digest and required assertions |
| Repair prerequisites | Ordered preparation or migration requirements |
| Publication authority | ENS name, resolver identity and relevant release approval |
| Artifact references | Locations and digests of the approved materials |

Do not use a moving Git branch or an unpinned “latest” URL as the approved release. Resolve the specific content and pin its identity.

## Deployment inventory

Each entry includes the chain ID, application address, relevant asset or market selector, inspection-module type, declared dependency path and expected administrative model. Its stable deployment key includes the chain, entrypoint and relevant selector so two markets within one contract are not accidentally treated as the same check target.

Where possible, inspection validates the declared relationships against chain state. A user declaration is not itself proof that the application takes that path.

The inventory records coverage gaps. The system does not pretend that a successful import discovered every contract the organization owns.

## Acceptance policy

The acceptance policy is the funded-agreement-specific interpretation of completion. A diagnostic run instead uses the verification specification described in section 8. The funded policy includes:

- Customer and maintainer identities and their destination-chain beneficiary addresses.
- Explicit Arc depositor and challenger addresses for each party, and an explicit Arc arbiter address; no role is inferred merely from being a beneficiary.
- Source chain and registry; destination chain and vault.
- A unique policy nonce and schema version.
- Covered deployment inventory and repair-manifest commitments.
- Complete required test suite and relevant configuration predicates.
- Evaluator identity, authorized reporting workflow and trust policy.
- Fee, optional bond, designated token and maximum permitted dispute allocation.
- Funding, completion, receipt, challenge and arbitration deadlines.
- Arbiter identity, eligible challenge rules and timeout allocation.
- Publication and artifact-availability requirements.
- The payable milestone: successful repair of the specified live deployments.

**The baseline pays for verified deployed repair, not merely for a passing preview or publication of a patch.**

An agreement ID must be derived using canonical encoding of the policy hash and its domain identifiers. Domain identifiers include the source and destination chain/contract identities and a unique nonce. “Canonical encoding” means all implementations encode the same logical values into the same bytes. Do not hash loosely formatted JSON independently in different services.

A participant may control a Safe on Sepolia and use a different address on Arc. Bind the source approver and Arc beneficiary/depositor explicitly; do not assume equal addresses imply equal authority across chains.

For the first demo, each party's designated Arc depositor also serves as its challenger, with that equality explicitly recorded in the policy. The arbiter must be an account or contract capable of acting on Arc. A source-chain Safe does not automatically gain destination-chain challenge or arbitration authority.

## Verification run and evidence bundle

Every bundle includes a verificationScopeId, run ID, purpose, execution mode, chain snapshot, test-pack digest, runner version, complete outcomes and artifact digest. Purpose distinguishes diagnostic use from funded acceptance. Execution mode separately distinguishes preview from actual deployed-state verification. A funded bundle additionally includes its agreement ID and immutable policy hash; a diagnostic report has neither a financial agreement nor a right to settle one.

For the first implementation, one run covers the entire required inventory on one source chain at one block number and hash. Its per-deployment entries contain the stable deployment key, observed route, implementation/configuration fingerprints, required assertions, outcomes and traces. Do not combine a pass from yesterday for one deployment with today's pass for another and call that one qualifying snapshot.

CRE validates the full bundle against the committed inventory and required assertion set. Every required deployment and assertion must appear exactly once, and all required results must pass. Missing entries, duplicates, unexpected snapshot differences or stale evidence make the run ineligible. The source contract checks the report's scope/policy commitments and authenticated workflow origin; it does not independently rerun or parse every fork trace. This structural validation does not eliminate evaluator dishonesty.

It also records test setup changes such as seeded accounts or allowed state overrides. A state override changes the simulated environment. Hidden overrides can make a broken deployment look healthy, so every allowed override belongs in the approved test definition and report.

A run cannot manufacture a pass by omitting failed assertions. The required assertion set comes from the policy. Missing output, a crashed worker or a required observation that cannot be obtained produces Unknown or a failed run, never Pass.

## Onchain report and messages

Only the funded-acceptance path produces a financially qualifying onchain completion report. That report carries the minimum fields needed to bind acceptance to the policy and complete evidence. It includes an explicit result type, run/report identity, required-scope commitment, source snapshot, evidence digest and validity information. The registry must reject diagnostic-purpose and preview-mode report types.

CCIP messages have an explicit schema version and message type. The initial types are PolicyApproved and CompletionRecorded. Business identity is separate from a transport message ID: retransmitting the same report with a new CCIP ID must not create a second claim or payment.

## Suggested API responsibilities

| Operation | Purpose |
| --- | --- |
| Register inventory | Validate and store the customer's declared deployment scope |
| Inspect deployment | Resolve a supported path and report coverage/authority |
| Start verification | Create an idempotent asynchronous run |
| Read run | Return current job status and complete results when available |
| Fetch artifact | Return immutable evidence bytes matching a digest |
| Prepare repair transaction | Return reviewable calldata and simulation details |
| Read agreement view | Combine onchain state with evidence and delivery status |

Wallet transactions approve policies, fund, challenge and withdraw. An API endpoint must not be able to substitute for those required onchain permissions.

# 11 The verification pipeline in detail

## Stage 1 Establish coverage and select a snapshot

Validate chain IDs, addresses, adapter support and required metadata. Select a block under the configured finality policy. Record both its number and hash.

All observations that claim to describe one snapshot must refer to that snapshot. Combining a proxy target from one block and an adapter setting from another can create a misleading result.

Unsupported means the product lacks the required inspection logic. Unknown means it attempted a supported check but could not establish a result. These are different from a known failed condition.

## Stage 2 Resolve the application path

Start at the registered application entrypoint. Use PatchBond's offchain inspection module to read the application's configured dependency. Follow the recognized proxy relationship and inspect the actual implementation.

Execution traces from relevant test transactions can corroborate which contracts are called. A trace of one operation does not establish every possible application branch. The coverage statement names the operations tested.

Do not infer upgrade authority only from a previous transaction sender or a plausible admin slot. For recognized contracts, inspect the actual governing account and role arrangement. Custom authority logic may remain unresolved.

## Stage 3 Check code configuration and authority

Compare the observed implementation identity with the approved release. Check required settings such as the intended feed, decimal conversion and initialization. Check the relevant role or ownership assumptions.

Only fields relevant to the agreed predicates should control readiness. Hashing every storage slot would cause ordinary activity, such as a user balance change, to invalidate an unrelated repair check.

OpenZeppelin validation can provide upgrade-compatibility evidence when source and build metadata are available. An implementation-code match alone does not prove storage compatibility or correct application behaviour.

## Stage 4 Execute regression tests

A regression test checks that a known defect does not reappear. A negative test exercises the prohibited behaviour; a positive test verifies intended behaviour still works.

For the first oracle-adapter test pack, include invalid input rejection, valid update acceptance, feed selection, decimal handling and a representative application operation. Include state-preservation checks relevant to the repair.

A revert must match the intended condition. A generic “transaction reverted” is not enough if the actual reason is that the whole system is paused or lacks test funds.

Validate the test pack against a known-bad baseline. If both broken and repaired deployments pass, the test does not establish the desired distinction.

## Stage 5 Explain unfinished work

Translate each failed assertion into a concrete unmet requirement. Associate it with the recognized authorized party and any prerequisite actions.

Example: “The adapter still selects feed A; the accepted policy requires feed B. The adapter owner must submit the change.” This is more useful than a single red security score.

Do not make an LLM's judgment authoritative for acceptance or payment. An optional natural-language explanation can summarize deterministic results, but must not alter them.

## Stage 6 Prepare and verify repairs

A prepared transaction includes chain, destination, function, arguments, value and the state assumptions used for simulation. The signer should be able to review these independently.

After authorized execution, inspect a new actual chain snapshot and rerun the complete required suite. Preview-mode success cannot qualify as deployed completion.

## Stage 7 Publish acceptance evidence

The evaluator signs the complete report. CRE validates its binding and available corroborating facts. The registry records an accepted result only through the configured report path.

The application must distinguish a received report from a financially qualifying result. Evidence can be useful for diagnostics even when it is incomplete, stale or unsuitable for settlement.

# 12 Trust and freshness

## What the evaluator can and cannot prove

The first implementation trusts the evaluator agreed by the parties. That evaluator can be a designated security team or service. Its signature proves the source of its assertion.

CRE can check the signature, the policy and facts it can independently read. It does not rerun arbitrary Foundry tests merely by retrieving their report. Multiple nodes agreeing on an API response do not establish that the API operator executed the claimed computation. [CRE consensus model](https://docs.chain.link/cre/concepts/consensus-computing)

Public replay makes a report contestable. It does not guarantee that someone will replay it. A dishonest authorized evaluator that goes unchallenged remains a residual risk.

The first version should not add a new zero-knowledge proof system, trusted execution environment or evaluator voting network just to conceal that limitation. Those would be separate security designs requiring their own validation.

## Facts CRE can corroborate

Use documented EVM capabilities and supported getters/events. Where arbitrary storage reads or execution traces require an external RPC or worker, label that dependency in the evidence.

A Solidity contract cannot simply read another contract's arbitrary storage through a normal call. Do not design acceptance around an unsupported capability.

## Three separate meanings of status

| Status | Meaning | What can change it |
| --- | --- | --- |
| Historical acceptance | The agreed evidence qualified at a recorded snapshot and time | New evidence can dispute its accuracy; later drift does not erase history |
| Current observed readiness | Recent checks satisfy the selected repair conditions | Relevant deployment changes, expiry or failed observations |
| Financial status | Funds are awaiting funding, active, disputed, allocated or withdrawn | The vault's authorized transitions |

## The gap between checking and acting

A deployment can change after it is checked. This is a time-of-check to time-of-use problem: the facts used for a decision may no longer hold when someone acts.

A short report lifetime limits age but does not prevent an intervening change. Polling and events have delays. For the baseline, show observation times, recheck relevant changes and avoid claiming instantaneous protection.

An integrated controller can enforce some preconditions atomically with an action, meaning within one transaction. That stronger operational enforcement is outside this implementation.

## Finality and reorganizations

A recent block can be replaced during a chain reorganization. The implementation must choose and test finality rules for observations and message sending.

If a referenced snapshot becomes noncanonical, mark the affected evidence as unreliable in the current-status view. Financial intervention requires an authorized challenge before the fixed challenge cutoff C. This baseline has no additional administrative freeze or financial remedy for a reorganization discovered after C, even if finalization or withdrawal has not yet occurred. Already withdrawn money cannot be magically recovered. Waiting for appropriate finality and preserving a challenge interval reduce risk; they do not establish an absolute guarantee.

# 13 ENSv2 release authority

ENS associates names with records and permission structures. In this product, its value is a discoverable, delegated authority for release information, rather than simply displaying a readable wallet name.

The proposed supplier namespace has a candidate-release record and an approved-release record. The release operator can update the candidate record; a separate approver controls the approved record. A demonstrable unauthorized approval attempt must fail.

ENSv2 permissions can be scoped to a text key, but those roles apply across names served by that resolver instance. Use a dedicated resolver for the relevant authority domain. Do not assume a shared resolver gives per-name isolation. Reading and writing ENSv2 records also differs from ENSv1, so use its documented resolution path. [Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/)

ENS controls record-writing authority; it does not automatically enforce our entire two-party repair process. The acceptance registry implements customer and maintainer consent.

At agreement creation, record the chosen manifest digest and relevant authority snapshot. Later naming changes cannot replace funded terms. An authority compromise or unexpected resolver/record change should flag unsettled work for review. Any financial intervention must use the existing challenge process before its cutoff; a review flag is not an unlimited administrative freeze.

For this baseline, an authorized change after policy approval does not retroactively redefine the accepted repair. New terms require a new jointly approved policy. The exact revocation-handling code must follow this rule rather than inventing a hidden administrative override.

Name control does not prove that an account legally represents a real-world company. Establishing that relationship is a separate onboarding matter.

# 14 Chainlink report and message integration

CRE and CCIP solve different problems. CRE coordinates checks and produces a report. CCIP transports authenticated messages between chains. Neither is a substitute for a truthful evaluator.

## CRE receiver validation

AcceptanceRegistry accepts reports only through the configured forwarder and permitted workflow identity. A forwarder is the contract that delivers an authenticated workflow report to our receiver.

The receiver verifies policy identity, report type, completeness flags, temporal constraints and replay protection. A valid transport signature does not authorize arbitrary data to change any agreement.

Runtime configuration and accepted reporting authorities for an already funded agreement cannot be silently replaced by the platform administrator.

## Simulation is not live network execution

The current CRE write documentation says the simulation MockForwarder records a report without calling the consumer's onReport function. Therefore a simulation success flag or broadcast transaction hash does not establish that AcceptanceRegistry changed. [CRE onchain writes](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts)

Simulation is useful and prize-eligible, but the integrated demo must separately establish the receiver callback, registry state, CCIP delivery and Arc transition. If a custom test adapter performs part of this path, label it explicitly. Do not describe a local simulation as live decentralized execution.

## One directional message flow

The documented Sepolia-to-Arc Testnet route supports CCIP 2.0. The initial architecture sends policy setup and qualifying completion through that route. Tokens remain on Arc. [CCIP lane directory](https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia)

The source registry does not need a reverse message proving funding. It can record evidence independently. The Arc vault alone decides whether the destination agreement is initialized, funded and eligible to settle.

## Recoverable receipt and processing

Authenticate the router, source chain selector and exact source registry. Bind the message to the destination vault, policy and agreement.

Keep message receipt separate from business processing. A completion may arrive before setup or funding. Store a valid pending message or provide an explicit safe retry path; do not lose it permanently. Preserve the timestamp of the first authenticated destination receipt for each business report. Retries cannot change that timestamp. Timely receipt may be processed later; late receipt cannot be made eligible by replaying it.

Before choosing a no-completion refund, finalization must process or evaluate the agreement's stored timely completion candidate using the already recorded message and policy data. It must not treat an unprocessed inbox entry as absent evidence. Keep this operation bounded and independent of offchain RPC/API availability. Malformed or ineligible candidates follow the fixed rejection rules and cannot block exits indefinitely. A failed delivery that never reached authenticated receipt does not count as timely arrival.

Deduplicate by agreement and report identity, not just the CCIP message ID. Late messages cannot reopen a cancelled or settled agreement. Source records should support permissionless retransmission of the same approved payload, with an explicit transaction-fee mechanism.

These choices follow the failure model described in [CCIP best practices](https://docs.chain.link/ccip/evm/concepts/best-practices).

# 15 The maintenance agreement and money flow

The financial module is optional for using the verification platform, but it is part of the planned Arc demonstration.

The **fee** pays for the agreed maintenance milestone. The **bond** is the maintainer's optional agreed deposit that can be allocated under specified breach and dispute rules. A bond with no defined consequence is merely locked capital and should not be included for decoration.

For the initial demonstration, the maintainer is also the supplier-side financial counterparty. Store customer and maintainer accounting separately. Use Arc's designated test USDC and its ERC-20 interface consistently; native gas accounting must not be mixed with token amounts. Read decimals and network configuration explicitly. [Arc contract references](https://docs.arc.io/arc/references/contract-addresses)

## What completion purchases

The initial policy purchases successful repair of its specified live deployments, demonstrated by the approved test suite and recorded evidence. A supplier release, an upgrade simulation or one passing deployment does not alone satisfy that milestone.

Application-wide reopening is separate from releasing a payment whose completion condition has already qualified. Once that condition is met, the customer has no additional discretionary reopening signature that can indefinitely withhold payment.

Before completion qualifies, a customer-controlled pause can prevent mandatory positive-operation tests from passing. That blocks automatic acceptance; the worker must not hide the pause or simulate reopening and claim it verified an operating live deployment. Any customer obstruction must be addressed through the agreed responsibility and dispute clauses. Conversely, a passing repair test does not establish that reopening is prudent after every possible incident consequence.

## A proposed finite deadline model

Use fixed timestamps agreed before funding. The following ordering is a design requirement; actual durations must be chosen and tested before accepting deposits.

| Symbol | Deadline | Meaning |
| --- | --- | --- |
| F | Funding cutoff | Both required deposits must be present before this time |
| D | Source completion cutoff | A qualifying completion must be recorded by the source registry before this time |
| R | Destination receipt cutoff | The authorized completion must be received on Arc before this time |
| C | Challenge cutoff | An authorized party may open a financial dispute before this time |
| A | Arbitration cutoff | The named arbiter may resolve the dispute before this time |

Require F < D < R < C < A. The gap from D to R allows for finality and message delivery. C follows R so even a late qualifying message leaves an agreed review interval.

For deterministic implementation, use half-open windows: the operation is allowed while the relevant timestamp is strictly less than its cutoff; timeout handling is allowed at or after the cutoff. Tests must cover the exact boundary second.

Do not let a replay, a new report or a repeated challenge move these deadlines. Short testnet demonstration windows must be labelled as demo settings, not presented as commercially reasonable dispute periods.

## Funding and incomplete funding

Each designated party funds its required deposit through an explicit agreement function. A plain token transfer to the vault is not automatically assigned to an agreement.

If the funding window closes without both deposits, each actual depositor can recover its allocated contribution. The agreement becomes cancelled. Any later completion message is unable to reactivate it.

A qualifying report can be received before full funding, but it cannot cause a payment. If full funding occurs within F, the report is considered only under the unchanged policy and remaining deadline rules.

## Successful unchallenged completion

A report must correspond to the exact agreement, meet its mandatory checks, be recorded before D and arrive before R.

At or after C, if the agreement was fully funded and has an eligible unchallenged completion, finalization allocates the fee to the maintainer and returns the bond to the maintainer.

Use a pull-payment design: finalization records withdrawable balances; the entitled participant withdraws to its preapproved beneficiary. This reduces the chance that one failed transfer blocks the whole agreement.

## Missing completion

If no eligible completion exists by R, the system cannot conclude that the maintainer was dishonest. It knows only that the agreed evidence did not arrive within the required window.

At C, absent a dispute and after accounting for any timely pending completion as described in section 14, the default returns the customer's fee and the maintainer's bond. No evidence-delivery failure alone slashes the bond.

## Challenges and arbitration

A designated Arc challenger can open a challenge directly on Arc before C, even if the API, evaluator or cross-chain lane is unavailable. The vault checks the caller against the explicit challenger addresses in the policy. The challenge references an evidence digest and a covered dispute reason. Only one active dispute is needed; additional material cannot reset deadlines.

The named arbiter evaluates the agreed evidence and responsibility clauses. It may allocate only the funds locked in that agreement, to the preapproved participants, within the agreed caps. Every terminal resolution must allocate the entire accounted, unwithdrawn agreement balance; a partial award cannot leave an unassigned remainder. Any bond amount not awarded under the permitted compensation rule returns to its depositor, and the fee allocation must also be complete. Cancellation allocates actual contributed amounts rather than nominal required deposits. The arbiter cannot withdraw unrelated balances or upgrade the customer application.

The policy must define the covered bond breaches before funding. For example, it could cover a proven failure to perform a maintainer-controlled mandatory repair step, with a capped allocation. A failed application check caused by a customer-controlled setting is not automatically that breach.

If arbitration ends without a decision at A, the default returns the original fee and bond to their respective depositors. Permissionless timeout finalization and withdrawals must work without the evaluator or platform operator.

This fallback bounds lock-up but does not guarantee commercial fairness. A customer could dispute completed useful work and benefit if the arbiter disappears. Choosing a supplier-favouring fallback reverses that risk. The parties must knowingly accept the selected allocation rule.

## Proposed state machine

~~~mermaid
stateDiagram-v2
    [*] --> AwaitingFunding
    AwaitingFunding --> Active: Both deposits before F
    AwaitingFunding --> Cancelled: Incomplete funding at F
    Active --> CompletionRecorded: Eligible source completion arrives before R
    Active --> Disputed: Authorized challenge before C
    CompletionRecorded --> Disputed: Authorized challenge before C
    CompletionRecorded --> Allocated: Unchallenged finalization at C
    Active --> Refunded: No eligible completion and no dispute at C
    Disputed --> Allocated: Arbiter resolves before A
    Disputed --> Refunded: No decision by A
    Allocated --> Closed: Entitled withdrawals complete
    Refunded --> Closed: Refund withdrawals complete
    Cancelled --> Closed: Remaining deposits withdrawn
~~~

An implementation may store receipt and payment substates separately to handle message ordering. Whatever the enum names, terminal allocations cannot be reopened by delayed messages.

# 16 Contract responsibilities and invariants

An **invariant** is a condition that must remain true across every allowed sequence of operations. Invariants are more valuable here than tests that only confirm a happy-path function returns success.

## AcceptanceRegistry

The registry stores immutable policies, participant approvals and accepted report commitments. It authenticates the reporting forwarder/workflow and validates policy bindings.

Registration and consent use onchain calls from the actual participants. Smart-contract wallets can call these functions under their own rules. This avoids assuming that an EOA signature check covers every wallet type.

The registry should retain enough information to retransmit the same approved policy or report. A caller may pay the message fee, but cannot choose a different destination or mutate the payload.

## MaintenanceVault

The vault authenticates the source, holds deposits, preserves pending messages, enforces deadlines, records challenges and finalizes allocations.

Use a non-upgradeable product vault for the first implementation. It is acceptable for the monitored customer fixtures to be upgradeable while the escrow logic itself is not. New vault versions apply to new agreements instead of silently altering existing funded terms.

The underlying networks and sponsor infrastructure still have their own governance and trust assumptions. A non-upgradeable vault does not remove those external dependencies.

## Invariants to encode in tests

- An agreement cannot pay more than its accounted deposits.
- The sum of its withdrawals and remaining allocated funds cannot exceed its funded balance.
- Every terminal outcome allocates the entire accounted remaining balance; no partial decision can strand a remainder.
- Another agreement's tokens cannot satisfy its obligations.
- Only the agreed recipients can receive allocations.
- A qualifying report is bound to one policy, deployment scope and destination.
- Both required approvals exist before a policy becomes financially usable.
- A partial deposit never permits full settlement.
- A retransmitted business report never pays twice.
- A challenge cannot extend the fixed cutoff times.
- Missing or unsupported evidence never becomes Pass.
- A preview-mode result never qualifies as deployed completion.
- No late message changes a terminal allocation.
- Timeout exits do not require the evaluator, backend or arbiter to be online.
- Platform administrative changes cannot rewrite the evaluator, deadlines or recipients of a funded agreement.

Avoid an unrestricted “admin mark passed” or “admin withdraw all” function. A development-only report adapter must be separately configured and unmistakably labelled, not hidden inside a production-looking receiver.

# 17 Security threats and their practical treatment

| Threat or failure | Required treatment | Residual limitation |
| --- | --- | --- |
| Malicious supplier repair | Approved test pack, negative and positive cases, review of supplied code | Tests may miss an unknown defect |
| Weak tests that always pass | Known-bad baseline and mutation checks | Coverage still depends on the agreed suite |
| Wrong dependency path | Supported route inspection and operation traces | Untested branches may differ |
| Evaluator forges a result | Signature authenticates identity; artifacts support replay and dispute | An authorized dishonest evaluator can still lie |
| RPC returns unavailable or inconsistent state | Pin snapshots; mark observations Unknown when necessary | RPC truth remains part of the configured trust model |
| Worker executes malicious input | Reviewed packs, bounded resources, restricted network/filesystem, no wallet secrets | Broader arbitrary-code support needs stronger isolation |
| Frontend proposes malicious calldata | Display full destination and arguments; restrict supported operations; signer reviews | A careless authorized signer can still approve harmful data |
| Backend edits a report after publication | Immutable artifact versions and digest verification | Hashing does not ensure continued availability |
| Source chain reorganizes | Wait for configured finality; flag unreliable evidence and challenge before C | No extra post-cutoff remedy; withdrawn funds cannot be automatically recovered |
| CCIP messages duplicate or reorder | Business-level deduplication and pending-message processing | Delivery latency still exists |
| ENS authority changes | Pin funded terms and authority snapshot; require explicit review where applicable | ENS naming is not proof of legal identity |
| Customer changes configuration after a pass | Separate current status from historical acceptance | Monitoring is not instantaneous |
| Arbitrator disappears | Fixed terminal timeout and agreed refund default | Default may favour one party economically |
| Database loses indexed events | Rebuild from chain records using durable checkpoints | Offchain private artifacts need independent retention |

## Important limits on readiness claims

The interface must not compress every condition into a universal security score. It should show the exact tested predicates, their observed values and their coverage.

An approved implementation with a wrong configuration should fail. An unavailable RPC should be Unknown. An unsupported custom router should be Unsupported. A previously passing deployment whose relevant assumptions changed should be Stale or require a new run.

That distinction is part of reliability, not a cosmetic reporting choice.

## Incident attribution

The Bonzo/Supra incident discussed during ideation must not be presented as an example of a customer ignoring an already available patch. The reports describe a verifier vulnerability and subsequent repair; they do not establish that missed adoption of a previously published fix caused the original attack.

PatchBond's justified connection is post-discovery repair coordination and verification. Without prior knowledge of the defect and an applicable control, it cannot claim it would have prevented that exploit. [Bonzo incident report](https://bonzo.finance/blog/bonzo-lend-incident-report-oracle-provider-exploit), [Supra report](https://supra.com/news/security-incident-report-hedera-pull-oracle-verifier/)

# 18 The user interface and daily workflow

## Repair campaign view

This view groups an approved repair with customer-specific policies and registered deployments. It shows inventory coverage, the last observation, results and remaining tasks.

Each row should answer what is wrong and what action follows. Examples include “old dependency instance,” “wrong decimal configuration,” “valid operation fails,” and “unsupported authority model.”

## Evidence view

Show the policy, tested application operation, dependency path, observed snapshot, complete assertions, relevant traces and download/replay instructions.

A useful report explains why a failure matters. It must also expose the exact technical observation so an engineer can verify the explanation.

## Action view

Show proposed operations in the order they must occur. Display the required authority, transaction destination and arguments, simulation assumptions and dependency on earlier steps.

The user signs through its existing wallet or governance process. PatchBond does not ask users to paste private keys.

## Agreement view

Show the fixed terms, fee, bond, funding status, eligible completion, deadlines, challenges, allocated balances and withdrawals.

Separate “message sent,” “message received,” “claim accepted” and “funds withdrawable.” These are different events; a cross-chain pending state must not appear as a successful payout.

## Notifications

The first version can provide in-app notifications and one explicitly configured external destination. Alerts should contain the changed condition, affected deployment, current owner/task and evidence link.

Do not make external notifications the only way to protect funds. The Arc challenge function and timeout exits remain directly callable.

# 19 Sponsor tracks and qualification evidence

The selected partners are Arc, Chainlink and ENS. The following are prospective From Scratch targets checked against the published Mumbai pages on 6 November 2026. Eligibility depends on the actual submission, not this design.

## Arc

Two targets are relevant:

| Official category | Published amount | PatchBond fit |
| --- | --- | --- |
| Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio | $3,000 | Conditional maintenance escrow, disputes and deterministic release/recovery |
| Best DeFi / Onchain Finance App Built End to End in Arc Studio | $3,000 | Complete payment and collateral workflow; secondary fit |

Both require Studio as the starting point, a shareable Studio project, Studio shown in the demo, working frontend/backend, an architecture diagram, video/presentation, documentation and a GitHub/Replit repository. Advanced Logic requires writing, testing, deploying and connecting the contracts within Studio. USDC or EURC is the relevant settlement asset.

The existing design does not qualify for the consumer marketplace-discovery category or non-USDC Bridge Kit category. Continuity is excluded. [Arc prize requirements](https://ethglobal.com/events/mumbai/prizes/arc)

Studio is a development environment; it is not the same thing as the Arc chain. Using Studio does not mean every Circle SDK must appear in the product. However, support for external HTTP integration does not prove that our Foundry worker can run inside Studio or that an external-worker development process satisfies the bounty. Validate that arrangement before relying on Arc eligibility. [Studio capabilities](https://studio.arc.io/)

## Chainlink

| Official category | Published amount | PatchBond fit |
| --- | --- | --- |
| Best workflow with CRE | $1,500 | Meaningful orchestration of external repair/evidence information and blockchain observations |
| Best use of Chainlink CCIP 2.0 | $3,500 pool, up to two awards of $1,750 | Contract-origin policy and completion messages change Arc agreement state |

CRE requires a meaningful workflow connecting a blockchain with an external system or source, and a successful CLI simulation or deployed workflow. CCIP requires actual use in smart contracts causing an onchain state change; reading a price feed in the frontend is insufficient. [Chainlink prize requirements](https://ethglobal.com/events/mumbai/prizes/chainlink)

The implementation evidence should include workflow source, simulation or deployment logs, receiver events/state, CCIP message identities and destination-state changes. Logs alone must not be used to imply an unexecuted callback.

## ENS

Best Use of ENSv2 has a $7,000 pool distributed as $3,000, $2,000, $1,000 and $1,000 awards. It requires ENSv2 on Ethereum mainnet or Sepolia, central functional use, a non-hardcoded demo, a live-demo link and public source. The Continuity category is excluded. [ENS prize requirements](https://ethglobal.com/events/mumbai/prizes/ens)

Our evidence should show delegated candidate publication, an unauthorized approval attempt being rejected, authorized approval succeeding and dynamic consumption of the approved release. Funded policies must remain unchanged after a later record edit.

ENS is the weakest target if the team implements only labels. A custom registry could provide similar application-specific permissions; ENS's proposed benefit is a portable, discoverable release namespace and established permission infrastructure.

## Event rules and prize stacking

Mumbai allows up to three partners; multiple categories under one partner count as one selection. The reviewed rules do not guarantee that one project can win multiple awards from the same sponsor.

The published submission deadline is **7 November 2026 at 09:00 IST**. From Scratch work must begin after the official start. Preserve incremental commits, identify reused material and disclose AI assistance. Meaningful human contribution is required. Spec-driven submissions must include their relevant specifications and planning materials.

Arc requires a demo video; the general upload bounds are 2–4 minutes and at least 720p. Use a human explanation and comply with the event's recording restrictions. Finalist judging is four minutes of demonstration plus three minutes of questions. [Mumbai submission rules](https://ethglobal.com/events/mumbai/info/details)

There are five prospective categories, with three stronger targets and two conditional ones. Neither current competition levels nor the probability of winning all targets has been established.

# 20 Lessons from past winning projects

ETHGlobal lists ENShell as a Cannes 2026 finalist and a CRE workflow winner. Its submission describes a security decision affecting whether an agent action proceeds. The relevant lesson is to show a consequential, inspectable workflow rather than a decorative security dashboard. The award is verified recognition, not an independent audit of its claims. [ENShell](https://ethglobal.com/showcase/enshell-6t95y)

Onda is listed as Cannes 2026 first place for Arc advanced stablecoin logic. Its described flow routes music tips according to artist verification and escrow status. The useful lesson is a simple user story with a concrete conditional payment. [Onda](https://ethglobal.com/showcase/onda-q1we4)

OpenBook's ETHOnline 2026 Arc award and MARS's New York 2026 Arc first-place award show existing interest in conditional service payments and auditing-related escrow. They also establish nearby prior art: security plus a bond is not a new category. [OpenBook](https://ethglobal.com/showcase/openbook-8ngw6), [MARS](https://ethglobal.com/showcase/mars-ua1qc)

PatchBond's demo must therefore earn attention through the customer-specific repair evidence: a correct implementation can still leave the application incorrectly integrated. Sponsor recognition of earlier projects does not reveal the judges' private reasoning or predict this project's result.

# 21 Build sequence and completion criteria

Build one working vertical slice early. A vertical slice is a thin but complete path through the UI, backend, verification, contracts and settlement. It exposes integration failures before the team spends time polishing disconnected components.

## Phase 1 Validate integration feasibility

Before building a large interface, prove the risky connections.

| Probe | Required evidence | If it fails |
| --- | --- | --- |
| Arc Studio workflow | Shareable project, app/backend operation and contract deployment through the required process | Resolve the workflow or revise Arc eligibility; do not claim compliance |
| External verification worker | A bounded fork test completes and returns retrievable signed evidence | Fix runtime/RPC limitations before designing around unavailable execution |
| CRE report delivery | Real inputs, validated report and observed receiver state when claiming live delivery | Keep simulation explicitly labelled; do not claim the full live path |
| CCIP route | Policy and completion messages produce the intended Arc changes | Fix delivery/authentication/retry handling before settlement demo |
| ENSv2 permissions | Authorized proposal/approval and rejected unauthorized mutation | Fix authority design before treating ENS as central |

Studio may allow external service integration without hosting a long-running worker itself. Its practical workflow and prize interpretation are open integration questions, not resolved facts.

Live CRE deployment access may require approval. Test available access early. A working local workflow is valuable but cannot be presented as a deployed DON.

## Phase 2 Establish shared schemas and fixtures

Implement the repair manifest, inventory, policy and evidence schemas first. Give each a version and deterministic encoding. Every component must consume the same definitions.

Create a documented fictional application fixture with an oracle adapter and recognized proxy. Build a known-bad implementation and approved repair. Use additional deployment instances to demonstrate the missed dependency and wrong configuration.

A fixture is a controlled example used to test behaviour. It is appropriate for the hackathon if the inspection and evidence pipeline is reusable and the addresses are discovered from input rather than hardcoded success cases.

Completion criteria: the tests reproduce the specific known problem, distinguish the corrected implementation and exercise a legitimate application operation.

## Phase 3 Implement inspection and reproducible evidence

Build the supported inspection module, proxy inspector, authority lookup, pinned-state worker and artifact exporter.

The replay interface should allow another developer to reproduce the run using the same approved test pack, tool versions and source snapshot. It may still require access to an archive-capable RPC; an artifact bundle alone does not necessarily contain the entire blockchain state.

Completion criteria: a second environment reproduces the recorded assertions, and unsupported or missing data never yields a pass.

## Phase 4 Implement the two contracts

Implement AcceptanceRegistry and MaintenanceVault with the approved state machine and fixed policy bindings. Prefer existing audited library components for access checks, token transfers and reentrancy protection.

Write invariants and adversarial lifecycle tests before connecting a polished frontend. Separate report receipt, message receipt and allocation to make failure paths inspectable.

Completion criteria: all legal transitions work, unauthorized transitions fail, and funds have finite exit paths under missing services.

## Phase 5 Connect sponsor flows

Wire ENS release information into the actual policy/verification path. Wire CRE reports into the registry. Wire CCIP setup and completion into Arc.

Keep simulation and live configurations separate. A test forwarder or manual adapter must not be silently selected in the production-looking UI.

Completion criteria: transaction/state evidence traces one agreement from both approvals to funding, accepted completion and final allocation.

## Phase 6 Build the operational interface

Implement campaign, evidence, action and agreement views. Display current observations separately from historical acceptance and financial status.

Add clear loading, retry, stale, unsupported and pending-message states. A dashboard that displays success before destination finalization creates a security misunderstanding.

Completion criteria: a teammate unfamiliar with the implementation can diagnose a failed deployment, find the responsible party and complete the workflow without reading backend logs.

## Phase 7 Harden and prepare submission

Run the full acceptance matrix, check secrets, preserve the incremental Git history and document reused libraries. Verify the Studio project, live-demo link, repository, video and architecture diagram.

Run the demo repeatedly with fresh agreement IDs. A successful run using old cached state is not enough. Document the exact demo environment and any simulated stages.

## Suggested repository layout

This is a proposed structure, not a list of existing files.

~~~text
patchbond/
  apps/web/                 User interface
  services/api/             Requests, job coordination and indexed views
  services/verifier/        Isolated inspection and test worker
  workflows/cre/            Chainlink workflow code
  contracts/src/            AcceptanceRegistry and MaintenanceVault
  contracts/test/           Contract and lifecycle tests
  fixtures/                 Demonstration application and repair versions
  testpacks/oracle-adapter/  Approved regression suite
  packages/schema/          Shared types, encodings and validators
  docs/                     Architecture, trust model, runbooks and evidence
~~~

The repository organization must fit the actual Studio workflow. A proposed local layout does not override sponsor requirements about how the application is built.

## Team ownership

A practical division is verification/evidence, contracts/integrations, and interface/demo. Share the policy and report schemas before splitting work.

AI coding agents can implement bounded components and tests, but humans must understand the trust decisions, inspect financial logic and explain the demo. Do not delegate acceptance criteria to an agent without reviewing what its tests actually establish.

# 22 Test plan and definition of done

## Verification tests

| Case | Expected result |
| --- | --- |
| Known vulnerable baseline | The relevant security assertion fails for the intended reason |
| Approved repair with correct integration | Negative and positive tests pass |
| Old dependency reached through another path | Fail with the observed path and missing action |
| Correct code with wrong settings | Fail the configuration or application assertion |
| Entire application paused | Positive operation fails; no false acceptance |
| Required source/build metadata absent | Relevant validation is Unknown or unavailable |
| Required assertion omitted from output | Run cannot qualify |
| Deployment omitted, duplicated or reported from a different snapshot | Whole funded run is ineligible |
| Diagnostic report submitted to funded receiver | Reject the report type and binding |
| Fixture-specific addresses changed | Inspection still works from inventory input |
| Preview contains simulated upgrade | Preview result remains ineligible for deployed completion |
| Actual deployed repair inspected | Result can qualify under policy and time rules |
| Relevant configuration changes after pass | Current readiness is rechecked or marked stale |
| Archive RPC unavailable | Unknown/retryable job, not a fabricated pass |

## Contract and financial tests

Test both ordinary examples and randomized sequences of operations. Randomized invariant tests can explore unexpected orders of funding, receipt, challenge, finalization and withdrawal.

Cover wrong policy hashes, wrong chain or sender, unapproved participants, partial funding, duplicate business reports, completion before setup, completion before funding, timely receipt processed after R, refund racing with an unprocessed timely candidate, expired receipts, boundary timestamps, repeated challenges, incomplete arbiter allocations, arbiter nonresponse and terminal-state replay.

Verify that a recipient cannot withdraw another recipient's allocation and that token accounting is exact. A report arriving after cancellation must not revive the agreement. An emergency control, if any is introduced, must not silently remove the agreed withdrawal paths.

## Integration tests

Trace the full sequence from source policy approval to Arc initialization and then from source completion to Arc settlement. Record transaction hashes and read actual contract state.

Test the loss of each service independently: API, worker, artifact storage, RPC and scheduled finalizer. Classify which actions stop and which contract exits remain available.

Verify the difference between receiving a message and processing it. A temporary business-state mismatch must have a safe, visible retry path.

## User experience tests

A person reading the dashboard must be able to answer which deployments were checked, which checks failed, who can act and whether payment is merely pending or withdrawable.

A new reader should not mistake a simulated preview for deployed verification, a historical pass for current safety, or an Unknown result for a failure attributable to the supplier.

## Definition of done for the hackathon

- The supported inspection pattern is documented and reusable across configurable deployments.
- Known-bad and legitimate behaviours are exercised through application entrypoints.
- Evidence is complete, versioned, retrievable and reproducible in a second environment.
- Actual deployed-state verification is distinct from preview simulation.
- Agreement terms and trust configuration cannot change after consent/funding.
- Funding, qualifying completion, challenge, settlement and timeout recovery work.
- Cross-chain authentication, replay and ordering tests pass.
- ENS permissions affect the release workflow and are demonstrated live.
- Every claimed sponsor integration has inspectable execution evidence.
- The UI reports coverage, observation time and uncertainty clearly.
- Documentation names the trusted evaluator and arbiter.
- The submission discloses simulated stages, reused code and AI assistance.

This definition establishes a credible bounded prototype. It does not replace a production audit, operational review or customer validation.

# 23 The learning path

Learning should follow the implementation rather than becoming a long prerequisite course.

## Exercise 1 Understand a deployment

Deploy a simple contract on a local development chain. Read its code, address and stored value. Call a function that changes the value and inspect the transaction receipt.

Outcome: explain the difference between source code, deployed code, contract state and a transaction.

## Exercise 2 Understand a proxy

Deploy a proxy with implementation V1, write state and upgrade it to V2 using established tooling. Confirm that the proxy address stays the same and inspect the preserved state.

Then introduce an incompatible storage change and observe the validation failure. Explain why changing a pointer can affect code execution without replacing the stored application data. [OpenZeppelin proxy guide](https://docs.openzeppelin.com/upgrades-plugins/proxies)

## Exercise 3 Understand fork tests

Run a test against a fixed historical block. Record the block hash, inputs, expectations and tool version. Repeat it in another environment.

Observe the difference between modifying simulated state and changing the live chain. [Foundry documentation](https://getfoundry.sh/)

## Exercise 4 Understand authority

Give different accounts different rights in a fixture. Try the same operation from an authorized and unauthorized account.

Explain why observing a contract or preparing calldata does not grant the right to execute an upgrade. Test a contract-wallet caller as well as an ordinary account.

## Exercise 5 Understand escrow accounting

Implement funding and withdrawal on a local test contract. Write tests for incomplete deposits, wrong recipients, repeated withdrawal and timeouts.

Do this before adding cross-chain delivery. Otherwise a message failure and an accounting failure become difficult to distinguish.

## Exercise 6 Understand CRE and CCIP separately

First run a CRE workflow over a small external response and an onchain getter. Inspect the report. Separately send a CCIP message that changes a simple destination state.

Only combine them after each path has observable evidence. Understand which components are simulated and which have executed on a network.

## Exercise 7 Understand ENSv2 permissions

Create the intended authority arrangement and demonstrate three operations: a permitted proposal, a rejected unauthorized approval and a successful authorized approval.

Check that changing a record does not alter a funded policy commitment. Learn the resolver's actual scope rather than assuming permissions are per name.

## Exercise 8 Explain the trust model without jargon

A teammate should be able to explain who writes the fix, who executes it, who runs the tests, who can lie, who can challenge, who resolves a dispute and who can withdraw.

If those answers are unclear, the implementation is not ready to hold even illustrative agreement balances without further review.

# 24 Demonstration and reviewer questions

## A three minute demonstration

The recorded demo can show the entire lifecycle using short, clearly labelled testnet deadlines and edited waiting intervals. Do not portray a pre-recorded or simulated event as a live production guarantee.

| Approximate time | What to show | Point established |
| --- | --- | --- |
| 0:00–0:25 | A repair campaign and the customer-specific agreement | The problem and the promised deliverable are understandable |
| 0:25–1:05 | Correct code hashes but a wrong dependency path/configuration; positive operation fails | Hash checking is insufficient |
| 1:05–1:35 | The responsible account reviews and executes the proposed action | Authority remains with the owner |
| 1:35–2:10 | Actual post-change checks, evidence and source acceptance | Completion is based on deployed behaviour |
| 2:10–2:40 | CCIP receipt and Arc settlement eligibility | Evidence has a real financial consequence |
| 2:40–3:00 | Duplicate message rejected; unauthorized ENS approval rejected | Integration and permission boundaries are real |

If Studio needs additional demonstration time, adjust the script within the submission's video bounds. Display the Studio project and required evidence rather than assuming an explorer link proves the required development workflow.

## Questions to be ready for

**Why is this more than a script?** Individual checks can be scripts. The product organizes reusable repair definitions, customer inventories, action ownership, shared acceptance evidence and optional settlement. Its value is operational reuse across organizations.

**Who writes the fix?** The supplier or developers. PatchBond verifies adoption of an agreed repair.

**Who executes the change?** Whoever holds the target contract's required authority. PatchBond prepares proposals without taking that authority.

**Does a pass mean the whole application is secure?** No. It means the named checks passed at the recorded snapshot.

**Can a correct patch still fail?** Yes. The application can reach another dependency, use the wrong settings or fail legitimate operations.

**Can the evaluator lie?** Yes. The agreed evaluator remains trusted for fork execution. Reproducibility and arbitration make assertions inspectable and challengeable, not trustless.

**Why use CRE?** It coordinates the policy, external evidence and available chain facts and delivers an authenticated report under the selected workflow. It does not prove a remote server's internal execution.

**Why use CCIP?** Source acceptance is recorded on Ethereum while the selected treasury settlement is on Arc. Messages carry authorized state changes between them. That separation is a design choice, not a universal requirement.

**Why use ENS?** For portable release discovery and delegated approval permissions. Displaying names alone would be insufficient.

**Why would a supplier post a bond?** Only if it accepts a commercial agreement with defined consequences. Willingness to do so is not established.

**What happens if no one responds?** Fixed timeout allocations make deposits recoverable. The default's fairness tradeoff is disclosed.

**Would this have prevented Bonzo?** The justified claim is assistance with known-repair coordination and verification. Prevention of the original unknown verifier exploit is not established.

**Is it production-ready?** Not until implementation, security testing, operations, integrations and an independent review support that claim.

# 25 Open decisions and implementation blockers

These are specific decisions still requiring technical evidence or commercial policy. They are not permission to silently invent capabilities.

| Item | What is known | What must be resolved |
| --- | --- | --- |
| Studio worker arrangement | Studio supports app development and external integrations | Confirm the actual runtime/development arrangement satisfies the target bounty |
| Live CRE access | Simulation is available as a valid category path | Verify deployment access and actual receiver execution for the integrated claim |
| Proxy and application adapter | One recognized oracle-adapter/transparent-proxy arrangement is the baseline | Freeze exact contract versions, ABIs and predicates before implementing inspection |
| RPC and finality | A pinned historical snapshot is required | Select providers, historical access and tested finality settings |
| Evaluator | Parties must agree on its identity | Select demo identity and secure signing process; document production trust |
| Arbiter and bond clauses | Arbitration is bounded to fixed participants and amounts | Define covered breaches, caps and operating responsibility before funding |
| Time windows | Fixed ordered cutoffs prevent infinite resets | Choose demo and prospective operational values separately |
| ENS revocation | Funded terms cannot change retroactively | Implement explicit review handling without indefinite fund locks |
| Same-sponsor awards | Multiple categories can be targeted | Obtain clarification before claiming simultaneous awards are permitted |
| Customer demand | Coordination pain has documented examples | Validate willingness to use the workflow and separately willingness to fund escrow |

The initial build should resolve integration blockers first. A larger interface cannot compensate for a report path or Studio workflow that does not function.

# 26 Glossary

The terms below are definitions for this project. They do not expand the product's guarantees.

| Term | Plain-language meaning |
| --- | --- |
| ABI | A description of a contract's functions and data encoding, used by software to call it |
| Acceptance | A decision that specified evidence satisfies agreed conditions |
| Acceptance policy | The fixed customer-specific rules defining the required repair, checks and financial terms |
| Adapter | A component that selects or translates another component's output for an application |
| Allowance | Permission for a named ERC-20 spender to transfer up to an approved token amount |
| Agreement ID | A unique identifier binding one policy and its domain to one agreement |
| API | An interface through which programs request information or operations from another service |
| Arbiter | The agreed party authorized to resolve a financial dispute under fixed rules |
| Archive-capable RPC | A blockchain data service able to answer the historical state queries the tests need |
| Artifact | A saved output such as a report, trace, test pack or replay input |
| Assertion | A precise test expectation, such as a value equalling the expected amount |
| Authentication | Establishing which identity supplied a message or request |
| Authorization | Establishing whether that identity may perform the requested action |
| Beneficiary | The preapproved recipient of a financial allocation |
| Block | A unit of recorded chain history containing transactions and identifying a state transition |
| Block hash | The identifier of a particular block |
| Bond | A deposit backing an agreed obligation, subject to its specified allocation rules |
| Bytecode | Executable code deployed on an EVM chain |
| Calldata | Encoded function and arguments supplied to a contract call |
| Canonical encoding | A single agreed way to turn structured values into bytes before hashing or signing |
| CCIP | Chainlink's cross-chain messaging infrastructure |
| Chain ID | A network identifier used to distinguish deployments and transaction domains |
| Chain selector | The identifier CCIP uses for a chain; it must not be confused with the EVM chain ID |
| Challenge | A formal dispute submitted before the agreed cutoff |
| CI | Continuous integration: automated checks run as software changes |
| Commitment | A recorded digest binding an identity or contract to specific content or terms |
| Configuration | Settings that affect how deployed code behaves |
| Contract wallet | A wallet whose authorization rules are implemented by a smart contract |
| CRE | Chainlink Runtime Environment, used here to coordinate evidence and chain interactions |
| Current readiness | The latest observed satisfaction of selected operating conditions, with freshness limits |
| Decimals | The number of decimal places used to convert integer token or price units into displayed values |
| Delegatecall | An EVM operation that executes another contract's code in the caller's storage context |
| Deployment | A particular contract instance on a particular chain |
| Dependency | A component an application relies on |
| Deterministic | Producing the same result for the same fully specified inputs and environment |
| Digest | Another name for a cryptographic hash of some content |
| DON | A decentralized oracle network used by deployed Chainlink workflows |
| EIP | Ethereum Improvement Proposal; a specification proposal or standard |
| ENS | Ethereum Name Service, used here for release discovery and authority records |
| EOA | An externally owned account controlled by a private key rather than contract logic |
| ERC-1967 | A standard describing storage locations for certain proxy information |
| ERC-20 | A standard token interface used for transfers and allowances |
| Escrow | Funds held under rules controlling when and to whom they are released |
| Evaluator | The agreed party or service that runs checks and asserts their results |
| Event | A log emitted by a contract transaction for observers to consume |
| EVM | Ethereum Virtual Machine, the execution environment used by Ethereum and compatible chains |
| Finality | The confidence or protocol status that recorded history will not be replaced |
| Fixture | A controlled example used to test or demonstrate behaviour |
| Fork test | A test in a private environment initialized from a selected chain snapshot |
| Forwarder | In CRE, the contract that delivers reports to an authorized receiver |
| Gas | The measure underlying fees for executing blockchain transactions |
| Governance | The rules and process through which a protocol authorizes decisions and changes |
| Hash | A compact fingerprint of bytes; it identifies content rather than proving its quality |
| Idempotency | Repeating an operation does not create an additional unintended effect |
| Implementation | The contract supplying logic executed through a proxy |
| Initializer | A function that sets up state for a proxy-based contract |
| Inspection module | PatchBond's offchain reader for a supported application pattern; not the application's oracle adapter |
| Invariant | A condition that must remain true across every permitted sequence of operations |
| Lease | Temporary ownership of a job that expires if a worker stops responding |
| Manifest | A structured description of a release and its associated requirements/artifacts |
| Mainnet | A network used for real applications and assets rather than development-only activity |
| Milestone | A specific deliverable whose completion can trigger an agreed payment |
| Multisig | A wallet or system that requires multiple authorized approvals |
| Nonce | A unique or increasing value used to distinguish operations and prevent reuse |
| Offchain | Outside blockchain execution and storage |
| Onchain | Recorded or executed through a blockchain |
| Oracle | A system making information available to a blockchain application |
| Policy hash | The commitment to the exact encoded acceptance-policy terms |
| Predicate | A precise condition that is either true or false for the supplied observations |
| Preview | A simulation of a proposed change, not evidence that it was deployed |
| Proxy | A contract at a stable address that delegates execution to an implementation |
| Pull payment | Recording an entitled balance so its recipient can withdraw it separately |
| Receiver | A contract that accepts and validates a delivered report or message |
| Regression test | A test checking that a known problem has not returned |
| Reorganization | Replacement of recent chain history by a different accepted history |
| Replay attack | Reusing an old authorized message to cause an unintended new effect |
| Replay bundle | The inputs and artifacts needed to reproduce a verification run |
| Resolver | In ENS, the component serving records for a name under its permission rules |
| RPC | The interface used to query a blockchain node or submit transactions |
| Runtime code hash | A fingerprint of code actually deployed at an address |
| Sandbox | A restricted environment intended to limit what executed code can access |
| Schema | The structure and meaning of a data record |
| Signature | Cryptographic authentication of an assertion by a signing key |
| Slashing | Allocating or taking a bond according to defined breach rules |
| Snapshot | The chain state selected for observations or testing |
| State override | A deliberate change to the simulated environment, which must be disclosed |
| Storage layout | The arrangement of a contract's persistent variables in storage |
| Test pack | A versioned collection of approved assertions and execution logic |
| Testnet | A development network used without production funds |
| Time of check to time of use | The risk that facts change between inspection and the later action |
| Trace | A record of execution steps or calls used to explain what happened |
| Transaction receipt | A record of a transaction's execution result; not proof of the intended business outcome |
| Trust boundary | The point where one component relies on another party or system's assertions |
| TTL | Time to live: the duration after which a result is considered too old for a particular use |
| USDC | Circle's dollar-denominated stablecoin; the demo uses the designated testnet asset |
| WASM | WebAssembly, the execution format used by CRE's TypeScript runtime |
| Workflow | An ordered process that coordinates operations and decisions |

# 27 Reading and implementation reference map

Use the source links beside the relevant claims as the primary references. This map groups the most useful starting points.

| Subject | Reference |
| --- | --- |
| Upgrade mechanics and proxy concepts | [OpenZeppelin Upgrades](https://docs.openzeppelin.com/upgrades-plugins) |
| Standard proxy storage information | [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967) |
| Existing monitoring-to-CRE workflows | [OpenZeppelin CRE guide](https://docs.openzeppelin.com/chainlink-cre) |
| Fork and Solidity testing | [Foundry documentation](https://getfoundry.sh/) |
| Transaction simulation and traces | [Tenderly simulations](https://docs.tenderly.co/simulations/overview) |
| CRE runtime limitations | [TypeScript runtime](https://docs.chain.link/cre/concepts/typescript-wasm-runtime) |
| CRE receiver execution and simulation caveat | [Onchain writes](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/overview-ts) |
| CCIP route configuration | [Sepolia testnet directory](https://docs.chain.link/ccip/directory/testnet/chain/ethereum-testnet-sepolia) |
| CCIP receiver and failure handling | [Best practices](https://docs.chain.link/ccip/evm/concepts/best-practices) |
| ENSv2 authority scope | [Permissioned Resolver](https://docs.ens.domains/ensv2/permissioned-resolver/) |
| Arc development workflow | [Arc Studio](https://studio.arc.io/) |
| Arc USDC configuration | [Arc contract references](https://docs.arc.io/arc/references/contract-addresses) |
| Sponsor and submission requirements | [Arc](https://ethglobal.com/events/mumbai/prizes/arc), [Chainlink](https://ethglobal.com/events/mumbai/prizes/chainlink), [ENS](https://ethglobal.com/events/mumbai/prizes/ens), [Mumbai rules](https://ethglobal.com/events/mumbai/info/details) |

The architecture should remain understandable through its evidence and permissions: a known repair, a declared deployment scope, explicit tests, an agreed evaluator, existing execution authority and bounded financial consequences. Every implementation decision should preserve those meanings.
