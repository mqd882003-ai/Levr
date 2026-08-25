// Avatar helpers — tint is hash-picked per person id, stable (DESIGN.md §1).
const AVATAR_TINTS = ["#FBF0DA", "#EDEFF1", "#E4F5EA", "#FBE9E7", "#EEE8F7", "#E3EFF8"];

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function avatarTint(id: string): string {
  let sum = 0;
  for (const ch of String(id)) sum += ch.charCodeAt(0);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}
