export default function CalendarLoading() {
  return (
    <section className="screen" aria-label="Calendar" aria-busy="true">
      <div className="topbar">
        <h1>Calendar</h1>
      </div>
      <div className="section">
        <div className="skel skel-chip" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
        <div className="skel skel-row" />
      </div>
    </section>
  );
}
