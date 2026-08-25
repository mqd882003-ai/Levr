import { avatarTint, initials } from "@/lib/avatar";

export default function Avatar({
  id,
  name,
  className = "avatar",
}: {
  id: string;
  name: string;
  className?: string;
}) {
  return (
    <span className={className} style={{ background: avatarTint(id) }}>
      {initials(name)}
    </span>
  );
}
