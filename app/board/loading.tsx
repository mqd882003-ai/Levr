export default function BoardLoading() {
  return (
    <section className="screen" aria-label="Board" aria-busy="true">
      <div className="topbar">
        <h1>Board</h1>
      </div>
      <div className="scope">
        <div className="skel skel-chip" />
        <div className="skel skel-chip" />
        <div className="skel skel-chip" />
      </div>
      <div className="skel skel-bar" />
      <div className="section">
        <div className="skel skel-row" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </div>
    </section>
  );
}
