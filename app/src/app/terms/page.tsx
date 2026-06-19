import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Insuirance",
};

export default function TermsPage() {
  return (
    <div
      className="min-h-screen px-6 py-16 max-w-2xl mx-auto"
      style={{ background: "#02080f", color: "#e8f4f8" }}
    >
      <Link
        href="/"
        className="text-sm mb-8 inline-block"
        style={{ color: "rgba(42,212,255,.7)" }}
      >
        ← Back
      </Link>

      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm mb-8" style={{ color: "rgba(160,200,230,.45)" }}>
        Effective date: June 2025 · Sui Testnet only
      </p>

      <div className="space-y-6 text-sm leading-relaxed" style={{ color: "rgba(200,225,240,.7)" }}>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">1. Testnet Software</h2>
          <p>
            Insuirance operates exclusively on the Sui Testnet. All assets, including dUSDC tokens
            and vault positions, are testnet assets with no real monetary value. This software is
            provided for demonstration and hackathon evaluation purposes only.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">2. No Warranty</h2>
          <p>
            The protocol is provided "as is" without warranty of any kind, express or implied.
            Smart contracts may contain bugs. Oracle feeds may be delayed or incorrect. Settlement
            may not occur as expected. Use at your own risk.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">3. Not Financial Advice</h2>
          <p>
            Nothing in this application constitutes financial, investment, or legal advice.
            Parametric cover is not insurance in any legal or regulatory sense. The hedge
            calculator outputs are illustrative estimates, not guarantees.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">4. Smart Contract Risk</h2>
          <p>
            Interactions with the on-chain contracts are irreversible. Depositing funds into the
            PredictManager or ShieldVault, purchasing cover policies, and claiming payouts are all
            final once confirmed on-chain. Always verify transaction details before signing.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">5. Oracle Dependency</h2>
          <p>
            Policy settlement depends on the DeepBook Predict oracle publishing a settlement price
            at expiry. If the oracle fails to settle, claims cannot be processed. The protocol has
            no mechanism to override oracle decisions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">6. No Liability</h2>
          <p>
            The developers of Insuirance accept no liability for any loss of funds, missed payouts,
            oracle failures, wallet compromises, network outages, or any other damages arising from
            use of this software.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">7. Jurisdiction</h2>
          <p>
            You are responsible for ensuring that your use of this protocol complies with all laws
            and regulations applicable in your jurisdiction. This application may not be available
            or appropriate for use in all locations.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-white">8. Changes</h2>
          <p>
            These terms may be updated at any time without notice. Continued use of the application
            constitutes acceptance of any updated terms.
          </p>
        </section>

      </div>

      <p className="mt-12 text-xs" style={{ color: "rgba(100,140,180,.3)" }}>
        Insuirance · Built on Sui + DeepBook Predict · Testnet Only
      </p>
    </div>
  );
}
