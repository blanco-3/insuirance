/**
 * Creates a PredictManager on testnet and deposits DUSDC into it.
 * Run: npx tsx scripts/setup-manager.ts
 *
 * Prereqs:
 *   - DUSDC in your wallet (request from Tony @ Mysten Labs)
 *   - SUI for gas
 */
import { SuiJsonRpcClient as SuiClient } from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

const PREDICT_PACKAGE = "0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138";
const PREDICT_ID = "0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a";
const DUSDC_TYPE = "0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC";

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

// Load keypair from sui CLI keystore
async function getKeypair(): Promise<Ed25519Keypair> {
  const { execSync } = await import("child_process");
  const result = execSync("sui keytool export --key-identity focused-amber --json 2>/dev/null", {
    encoding: "utf-8",
  });
  const parsed = JSON.parse(result);
  return Ed25519Keypair.fromSecretKey(parsed.exportedPrivateKey ?? parsed.key);
}

async function main() {
  const keypair = await getKeypair();
  const address = keypair.toSuiAddress();
  console.log("Address:", address);

  // Check DUSDC balance
  const coins = await client.getCoins({ owner: address, coinType: DUSDC_TYPE });
  if (coins.data.length === 0) {
    console.error("No DUSDC found. Request from Mysten Labs first.");
    process.exit(1);
  }
  const dusdcCoin = coins.data[0];
  console.log("DUSDC balance:", Number(dusdcCoin.balance) / 1e6, "DUSDC");

  // If a manager ID is passed as CLI arg, skip creation
  const existingManagerId = process.argv[2];
  let managerId: string;
  let managerInitialVersion: string;

  if (existingManagerId) {
    managerId = existingManagerId;
    const obj = await client.getObject({ id: managerId, options: {} });
    managerInitialVersion = String((obj.data as any)?.version ?? 1);
    console.log("Using existing Manager ID:", managerId);
  } else {
    // --- Tx 1: create_manager (shares the PredictManager on-chain) ---
    const tx1 = new Transaction();
    tx1.moveCall({
      target: `${PREDICT_PACKAGE}::predict::create_manager`,
      arguments: [],
    });

    const result1 = await client.signAndExecuteTransaction({
      transaction: tx1,
      signer: keypair,
      options: { showObjectChanges: true },
    });
    console.log("Tx1 digest:", result1.digest);

    const managerObj = result1.objectChanges?.find(
      (c: { type: string; objectType?: string; objectId?: string }) =>
        c.type === "created" &&
        c.objectType?.includes("PredictManager")
    );
    if (!managerObj || !("objectId" in managerObj)) {
      console.error("Could not find PredictManager in tx1 output");
      process.exit(1);
    }
    managerId = (managerObj as { objectId: string; version: string }).objectId;
    managerInitialVersion = (managerObj as { objectId: string; version: string }).version;
    console.log("Manager ID:", managerId);
  }

  // Re-fetch DUSDC coin after tx1 (version may have changed)
  const coins2 = await client.getCoins({ owner: address, coinType: DUSDC_TYPE });
  const dusdcCoin2 = coins2.data[0];

  // --- Tx 2: deposit DUSDC into the shared manager ---
  const tx2 = new Transaction();
  tx2.moveCall({
    target: `${PREDICT_PACKAGE}::predict_manager::deposit`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx2.sharedObjectRef({ objectId: managerId, initialSharedVersion: managerInitialVersion, mutable: true }),
      tx2.object(dusdcCoin2.coinObjectId),
    ],
  });

  const result2 = await client.signAndExecuteTransaction({
    transaction: tx2,
    signer: keypair,
    options: { showEffects: true },
  });
  console.log("Tx2 digest:", result2.digest);

  console.log("\nDone! Add to .env.local:");
  console.log(`NEXT_PUBLIC_MANAGER_ID=${managerId}`);
}

main().catch(console.error);
