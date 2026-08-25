"use client";

import { useEffect, useState } from "react";

// Greeting bands + rotating sub lines, per requirements §Home and the
// approved prototype's voice. Computed client-side so it uses the phone's
// local time (and so the random line doesn't cause a hydration mismatch).
function compute(name: string) {
  const h = new Date().getHours();
  let band: string, title: string, subs: string[];
  const glowBand = h < 5 ? "late" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  if (h < 5) {
    band = "Late night";
    title = `Still up, ${name}?`;
    subs = [
      "Get it out of your head so you can actually sleep.",
      "Whatever it is, dump it here and close the laptop.",
      "Tomorrow-you will thank you for writing it down.",
    ];
  } else if (h < 12) {
    band = "Morning";
    title = `Morning, ${name}.`;
    subs = [
      "Coffee's on. What's on your mind before it gets buried?",
      "Clean slate. What's the first thing pulling at you?",
      "Before the inbox wins: what matters today?",
    ];
  } else if (h < 17) {
    band = "Afternoon";
    title = `Afternoon, ${name}.`;
    subs = [
      "What's come up since this morning?",
      "Quick, before it slips: what's on your mind?",
      "Half the day's gone. What's still nagging you?",
    ];
  } else {
    band = "Evening";
    title = `Evening, ${name}.`;
    subs = [
      "Winding down or just getting started? Either way, let it out.",
      "What's still rattling around from today?",
      "Park it here so it's not in your head tonight.",
    ];
  }
  const eyebrow =
    band +
    " · " +
    new Date().toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  return {
    eyebrow,
    title,
    sub: subs[Math.floor(Math.random() * subs.length)],
    glowBand,
  };
}

export default function Greeting({ name }: { name: string }) {
  const [g, setG] = useState<{
    eyebrow: string;
    title: string;
    sub: string;
    glowBand: string;
  }>();
  useEffect(() => {
    setG(compute(name || "there"));
  }, [name]);

  return (
    <>
      <div className="home-glow" data-band={g?.glowBand} aria-hidden="true" />
      <div className="eyebrow">
        <span className="dot" />
        <span>{g?.eyebrow ?? " "}</span>
      </div>
      <h1 className="greeting-title">{g?.title ?? " "}</h1>
      <p className="greeting-sub">{g?.sub ?? " "}</p>
    </>
  );
}
