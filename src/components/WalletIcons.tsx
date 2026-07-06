/**
 * Icons for wallet connectors. Uses the connector's own icon when it provides
 * one (most EIP-6963 wallets do), and falls back to a proper WalletConnect
 * mark or a generic wallet glyph instead of a placeholder character.
 */

export function WalletConnectMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="11" fill="#3396FF" />
      <path
        d="M12.03 15.36c4.4-4.31 11.54-4.31 15.94 0l.53.52c.22.22.22.57 0 .78l-1.81 1.78c-.11.11-.29.11-.4 0l-.73-.72c-3.07-3.01-8.05-3.01-11.12 0l-.78.77c-.11.11-.29.11-.4 0l-1.81-1.78a.55.55 0 0 1 0-.78l.58-.57Zm19.69 3.67 1.61 1.58c.22.22.22.57 0 .78l-7.27 7.14c-.22.22-.58.22-.8 0l-5.16-5.07a.14.14 0 0 0-.2 0l-5.16 5.07c-.22.22-.58.22-.8 0l-7.27-7.14a.55.55 0 0 1 0-.78l1.61-1.58c.22-.22.58-.22.8 0l5.16 5.07c.06.06.15.06.2 0l5.16-5.07c.22-.22.58-.22.8 0l5.16 5.07c.06.06.15.06.2 0l5.16-5.07c.23-.22.59-.22.79 0Z"
        fill="#fff"
      />
    </svg>
  );
}

export function WalletMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2.5" y="5" width="19" height="14.5" rx="3.5" fill="#16130C" />
      <rect x="13.5" y="10" width="8.5" height="5.5" rx="2.75" fill="#FAF6EC" />
      <circle cx="17.4" cy="12.75" r="1.35" fill="#16130C" />
    </svg>
  );
}

export function ConnectorIcon({
  icon,
  name,
  id,
  size = 18,
}: {
  icon?: string;
  name?: string;
  id?: string;
  size?: number;
}) {
  if (icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        style={{ borderRadius: 5, display: "block" }}
      />
    );
  }
  const key = `${id ?? ""} ${name ?? ""}`.toLowerCase();
  if (key.includes("walletconnect")) return <WalletConnectMark size={size} />;
  return <WalletMark size={size} />;
}
