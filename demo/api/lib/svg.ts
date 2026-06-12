export function previewSvg(tokenId: string): string {
  return tokenSvg({
    background: "#f7f2e7",
    label: "Public preview",
    tokenId,
    accent: "#2f5f62",
    foreground: "#182322",
  });
}

export function privateSvg(tokenId: string): string {
  return tokenSvg({
    background: "#10211f",
    label: "Unlocked private image",
    tokenId,
    accent: "#a7f0d5",
    foreground: "#f7fbf6",
  });
}

function tokenSvg(input: {
  accent: string;
  background: string;
  foreground: string;
  label: string;
  tokenId: string;
}): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img">
  <rect width="1200" height="1200" fill="${input.background}"/>
  <rect x="96" y="96" width="1008" height="1008" fill="none" stroke="${input.accent}" stroke-width="18"/>
  <circle cx="600" cy="438" r="174" fill="${input.accent}" opacity="0.92"/>
  <path d="M270 858c92-156 202-234 330-234s238 78 330 234" fill="none" stroke="${input.accent}" stroke-width="44" stroke-linecap="round"/>
  <text x="600" y="1020" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="64" font-weight="700" fill="${input.foreground}">${escapeXml(input.label)}</text>
  <text x="600" y="112" text-anchor="middle" dominant-baseline="hanging" font-family="Inter,Arial,sans-serif" font-size="42" fill="${input.foreground}" opacity="0.78">Token #${escapeXml(input.tokenId)}</text>
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
