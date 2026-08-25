export default function TeamLoading() {
  return (
    <section className="screen" aria-label="Team" aria-busy="true">
      <div className="topbar">
        <h1>Team</h1>
      </div>
      <div className="team">
        <div className="skel skel-card" />
        <div className="skel skel-card" />
        <div className="skel skel-card" />
      </div>
    </section>
  );
}
