"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/ranks";

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <button
        className="wallet-chip"
        onClick={() => disconnect()}
        title="Click to disconnect"
      >
        <span className="dot" />
        <span className="mono">{shortAddress(address)}</span>
      </button>
    );
  }

  return (
    <>
      <button
        className="btn btn-primary"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Connect a wallet</h3>
            {connectors.length === 0 && (
              <p className="dex-note">
                No wallet detected. Install MetaMask or another browser wallet.
              </p>
            )}
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                className="connector-btn"
                onClick={() => {
                  connect({ connector });
                  setOpen(false);
                }}
              >
                {connector.icon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connector.icon} alt="" width={24} height={24} />
                )}
                {connector.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
