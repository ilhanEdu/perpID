import { createConfig, http } from "wagmi";
import { arbitrum, base, mainnet, optimism } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

const wcProjectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, base, optimism],
  connectors: [
    injected(),
    // WalletConnect only activates when a project id is configured.
    ...(wcProjectId ? [walletConnect({ projectId: wcProjectId })] : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
  },
  ssr: true,
});
